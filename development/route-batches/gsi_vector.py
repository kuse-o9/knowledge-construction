"""Small, bounds-checked MVT reader for GSI source acquisition (no runtime dependency).

Wire schema: https://github.com/mapbox/vector-tile-spec/blob/master/2.1/vector_tile.proto
GSI fields: https://maps.gsi.go.jp/help/pdf/vector/attribute.pdf
Coordinates are returned in slippy-map tile units; convert explicitly with lonlat.
"""
import math
import struct


def varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(data):
            raise ValueError('Truncated varint')
        b = data[pos]
        pos += 1
        value |= (b & 127) << shift
        if b < 128:
            return value, pos
    raise ValueError('Oversized varint')


def fields(data):
    pos = 0
    while pos < len(data):
        key, pos = varint(data, pos)
        field, wire = key >> 3, key & 7
        if not field:
            raise ValueError('Invalid protobuf field')
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire in (1, 2, 5):
            if wire == 2:
                size, pos = varint(data, pos)
            else:
                size = 8 if wire == 1 else 4
            if pos + size > len(data):
                raise ValueError('Truncated field')
            value, pos = data[pos:pos + size], pos + size
        else:
            raise ValueError('Unsupported wire type')
        yield field, wire, value


def packed(data):
    pos, out = 0, []
    while pos < len(data):
        value, pos = varint(data, pos)
        out.append(value)
    return out


def zigzag(value):
    return (value >> 1) ^ -(value & 1)


def property_value(data):
    values = []
    for field, wire, value in fields(data):
        if field == 1 and wire == 2:
            values.append(value.decode('utf-8'))
        elif field in (2, 3) and wire == (5 if field == 2 else 1):
            values.append(struct.unpack('<f' if field == 2 else '<d', value)[0])
        elif field in (4, 5, 6, 7) and wire == 0:
            if field == 4 and value >= 1 << 63:
                value -= 1 << 64
            values.append(zigzag(value) if field == 6 else bool(value) if field == 7 else value)
    if len(values) != 1:
        raise ValueError('Invalid MVT value')
    return values[0]


def geometry(commands, kind):
    pos, x, y, paths = 0, 0, 0, []
    while pos < len(commands):
        command = commands[pos]
        pos += 1
        op, count = command & 7, command >> 3
        if not count or op not in (1, 2, 7):
            raise ValueError('Invalid geometry command')
        if op == 7:
            if kind != 3 or count != 1 or not paths or len(paths[-1]) < 3:
                raise ValueError('Invalid close path')
            paths[-1].append(paths[-1][0][:])
            continue
        if pos + count * 2 > len(commands):
            raise ValueError('Truncated geometry')
        for _ in range(count):
            x += zigzag(commands[pos])
            y += zigzag(commands[pos + 1])
            pos += 2
            if op == 1:
                paths.append([])
            if not paths:
                raise ValueError('Line without move')
            paths[-1].append([x, y])
    return paths


def decode(data, layers=None):
    result = {}
    for field, wire, raw in fields(data):
        if field != 3 or wire != 2:
            continue
        name, keys, values, features, extent, version = None, [], [], [], 4096, 1
        for f, w, v in fields(raw):
            if f == 1:
                name = v.decode('utf-8')
            elif f == 2:
                features.append(v)
            elif f == 3:
                keys.append(v.decode('utf-8'))
            elif f == 4:
                values.append(property_value(v))
            elif f == 5:
                extent = v
            elif f == 15:
                version = v
        if layers is not None and name not in layers:
            continue
        if version not in (1, 2) or not name or extent <= 0:
            raise ValueError('Invalid layer metadata')
        output = []
        for raw_feature in features:
            item, tags, commands = {'id': None, 'type': 0}, [], []
            for f, w, v in fields(raw_feature):
                if f == 1:
                    item['id'] = v
                elif f == 2:
                    tags.extend(packed(v) if w == 2 else [v])
                elif f == 3:
                    item['type'] = v
                elif f == 4:
                    commands.extend(packed(v) if w == 2 else [v])
            if len(tags) % 2 or any(tags[i] >= len(keys) or tags[i+1] >= len(values) for i in range(0, len(tags), 2)):
                raise ValueError('Invalid property index')
            item['properties'] = {keys[tags[i]]: values[tags[i+1]] for i in range(0, len(tags), 2)}
            item['paths'] = geometry(commands, item['type'])
            output.append(item)
        result[name] = {'extent': extent, 'features': output}
    return result


def tile(lon, lat, z):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def lonlat(point, x, y, z, extent):
    n = 2 ** z
    return [round((x + point[0] / extent) / n * 360 - 180, 8),
            round(math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + point[1] / extent) / n)))), 8)]


def rail_state(value, z):
    if 14 <= z <= 16:
        return {0: 'surface', 1: 'bridge-or-viaduct', 2: 'tunnel', 3: 'underground', 4: 'snow-shed', 5: 'suspended', 6: 'other', 7: 'unknown'}.get(value, 'unknown')
    if 8 <= z <= 13:
        return {0: 'surface', 100: 'tunnel', 200: 'snow-shed', 300: 'underground', 400: 'street', 500: 'tunnel-without-portal'}.get(value, 'unknown')
    raise ValueError('Unsupported GSI railway zoom level')
