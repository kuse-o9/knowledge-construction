'use strict';

const questions = [
  {
    q: '3x + 7 = 22',
    hint: 'まず両辺から 7 を引きます。',
    steps: ['3x = 15', 'x = 5'],
    explain: '両辺から 7 を引き、その後、両辺を 3 で割ります。'
  },
  {
    q: '4x − 3 = 2x + 9',
    hint: 'x のある項を片側にまとめましょう。',
    steps: ['4x − 2x = 9 + 3', '2x = 12', 'x = 6'],
    explain: '両辺から 2x を引き、両辺に 3 を足して整理します。'
  },
  {
    q: '3(x + 2) = 21',
    hint: '両辺を 3 で割ると計算が短くなります。',
    steps: ['x + 2 = 7', 'x = 5'],
    explain: '両辺を 3 で割った後、両辺から 2 を引きます。'
  }
];

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let index = 0;
let mode = 'pen';
let strokes = [];
let active = null;

const notes = new Map();

// ノートを描画する
function render() {
  ctx.clearRect(0, 0, 1000, 750);

  const items = [...strokes, ...(active ? [active] : [])];

  for (const s of items) {
    ctx.save();

    ctx.globalCompositeOperation =
      s.mode === 'eraser' ? 'destination-out' : 'source-over';

    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        s.points[0].x,
        s.points[0].y,
        s.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else {
      ctx.beginPath();

      s.points.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });

      ctx.stroke();
    }

    ctx.restore();
  }

  $('undo').disabled = !strokes.length;
}

// 保存データの形式を確認する
function valid(data) {
  return (
    Array.isArray(data) &&
    data.length <= 5000 &&
    data.every(s =>
      s &&
      ['pen', 'eraser'].includes(s.mode) &&
      /^#[0-9a-f]{6}$/i.test(s.color) &&
      Number.isFinite(s.width) &&
      s.width > 0 &&
      s.width <= 60 &&
      Array.isArray(s.points) &&
      s.points.length <= 30000 &&
      s.points.every(p =>
        Number.isFinite(p.x) && Number.isFinite(p.y)
      )
    )
  );
}

// この問題のノートを読み込む
function load() {
  strokes = notes.get(index) || [];

  try {
    const raw = localStorage.getItem('study-note-v1-' + index);

    if (raw) {
      const data = JSON.parse(raw);

      if (valid(data)) {
        strokes = data;
      }
    }
  } catch {
    // 保存領域を使えない場合もノートは使える
  }

  render();
}

// ノートをブラウザー内に保存する
function save() {
  notes.set(index, strokes);

  try {
    localStorage.setItem(
      'study-note-v1-' + index,
      JSON.stringify(strokes)
    );

    $('status').textContent = 'このブラウザーに保存しました';
  } catch {
    $('status').textContent =
      '自動保存できません。画像で保存してください。';
  }
}

// 問題・ヒント・解答を表示する
function show() {
  const q = questions[index];

  $('number').textContent =
    '一次方程式 / 問題 ' + (index + 1) + ' of ' + questions.length;

  $('question').textContent = q.q;
  $('hinttext').textContent = q.hint;
  $('answer').replaceChildren();

  q.steps.forEach(step => {
    const line = document.createElement('div');
    line.textContent = step;
    $('answer').append(line);
  });

  const explanation = document.createElement('p');
  explanation.textContent = q.explain;
  $('answer').append(explanation);

  $('hint').open = false;
  $('solution').open = false;

  $('prev').disabled = index === 0;
  $('next').disabled = index === questions.length - 1;

  load();
}

// ペンと消しゴムを切り替える
function selectTool(tool) {
  mode = tool;

  for (const name of ['pen', 'eraser']) {
    $(name).classList.toggle('selected', name === tool);
    $(name).setAttribute('aria-pressed', String(name === tool));
  }
}

// 画面上の位置をノート上の座標に変換する
function point(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) * 1000 / rect.width,
    y: (event.clientY - rect.top) * 750 / rect.height
  };
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || active) return;

  canvas.setPointerCapture(event.pointerId);

  active = {
    mode,
    color: $('color').value,
    width: mode === 'eraser' ? 32 : Number($('width').value),
    pointer: event.pointerId,
    points: [point(event)]
  };

  render();
});

canvas.addEventListener('pointermove', event => {
  if (!active || active.pointer !== event.pointerId) return;

  active.points.push(point(event));
  render();
});

// 一筆を書き終えたときに保存する
function finish(event) {
  if (!active || active.pointer !== event.pointerId) return;

  const { pointer, ...stroke } = active;

  strokes.push(stroke);
  active = null;

  render();
  save();
}

canvas.addEventListener('pointerup', finish);
canvas.addEventListener('pointercancel', finish);
canvas.addEventListener('lostpointercapture', finish);

$('pen').onclick = () => selectTool('pen');
$('eraser').onclick = () => selectTool('eraser');

$('undo').onclick = () => {
  strokes.pop();
  render();
  save();
};

$('clear').onclick = () => $('confirm').showModal();
$('cancel').onclick = () => $('confirm').close();

$('confirmclear').onclick = () => {
  strokes = [];
  render();
  save();
  $('confirm').close();
};

// 問題を切り替える
function navigate(nextIndex) {
  if (active) {
    throw new Error('書き終えてから問題を切り替えてください');
  }

  if (
    !Number.isInteger(nextIndex) ||
    nextIndex < 0 ||
    nextIndex >= questions.length
  ) {
    throw new Error('問題番号が正しくありません');
  }

  save();
  index = nextIndex;
  show();

  return {
    questionNumber: index + 1,
    question: questions[index].q
  };
}

$('prev').onclick = () => navigate(index - 1);
$('next').onclick = () => navigate(index + 1);

// ノートを画像としてダウンロードする
$('download').onclick = () => {
  const output = document.createElement('canvas');
  output.width = 1000;
  output.height = 830;

  const outputContext = output.getContext('2d');

  outputContext.fillStyle = 'white';
  outputContext.fillRect(0, 0, 1000, 830);

  outputContext.fillStyle = '#1e3554';
  outputContext.font = '24px sans-serif';
  outputContext.fillText(
    'Study Note / 問題 ' + (index + 1) + ' : ' + questions[index].q,
    30,
    48
  );

  outputContext.drawImage(canvas, 0, 80);

  const link = document.createElement('a');
  link.download = 'study-note-' + (index + 1) + '.png';
  link.href = output.toDataURL('image/png');
  link.click();

  $('status').textContent = '画像の保存を開始しました';
};

show();

// 対応ブラウザーで現在の問題を読み取れるようにする。
// AI採点やノート画像の送信は行わない。
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: 'get_current_study_question',
        description:
          '現在の数学の問題を読み取ります。手書き内容は含みません。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true
        },
        execute: () => ({
          questionNumber: index + 1,
          question: questions[index].q,
          aiGradingConnected: false
        })
      })
    ).catch(() => {});
  } catch {
    // 未対応の場合は通常のノートとして動作する
  }
}
