function l(what) {
  return document.getElementById(what);
}
var loaded = false;
var splitL = {
  splits: {},
};

let subscribedGets = {};
let onGet = (what, func) => {
  subscribedGets[what] = func;
};

window.onload = () => {
  loaded = true;
  splitL.timerSplitContainer = l('srTimerSplitContainer');
  splitL.timerExtraL = l('srTimerExtra');
  onGet('srtTest', () => {
    console.log('hi');
  });
};

function clearSplits() {
  if (!loaded) return;
  // remove splits
  while (splitL.timerSplitContainer.firstChild) {
    splitL.timerSplitContainer.removeChild(splitL.timerSplitContainer.firstChild);
  }

  // remove extras
  while (splitL.timerExtraL.firstChild) {
    splitL.timerExtraL.removeChild(splitL.timerExtraL.firstChild);
  }

  splitL.splits = {};
}

function icon(attr = '', icon = null, size = 48, content = '') {
  return `<span ${attr}
  ${
    icon
      ? `style="${icon[2] ? `background-image:url(${icon[2]});` : ''}${`background-position:${
          -icon[0] * size
        }px ${-icon[1] * size}px;`}"`
      : ''
  }>${content}</span>`;
}

function addSplit({ id, split }) {
  splitL.timerSplitContainer.insertAdjacentHTML(
    'beforeEnd',
    `<div class="sr-split-line" id="srSegLine${id}"><div class="sr-split-desc">${icon(
      'class="sr-split-icon"',
      split.icon || [8, 0],
      24
    )}<span class="sr-split-name">${
      split.name || 'Segment ' + id.toString()
    }</span></div><span class="sr-split-delta" id="srSegDelta${id}"></span><span class="sr-split-time" id="srSegTime${id}"></span></div>`
  );
  splitL.splits[id] = {};
  splitL.splits[id].lineL = l(`srSegLine${id}`);
  splitL.splits[id].deltaL = l(`srSegDelta${id}`);
  splitL.splits[id].timeL = l(`srSegTime${id}`);
}
