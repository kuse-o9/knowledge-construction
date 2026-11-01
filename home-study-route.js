'use strict';
(()=>{function route(){if(/^#(?:study|memory)-[a-z0-9_-]+$/i.test(location.hash)){location.replace(new URL('practice.html'+location.search+location.hash,location.href).href);}}window.addEventListener('hashchange',route);route();})();
