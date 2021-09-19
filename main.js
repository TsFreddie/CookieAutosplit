Game.registerMod('ccSplit', {
  // Split schema
  /*
    {
      "name": String,
      "splits": [
        {
          "name": String,
          "condition": String (JavaScript expression),
          "type": "consequential" | "sequential" | "individual" | "manual" | "fail",
          "icon": [Number, Number]
        },
        ...
      ]
    }

    The "splits" field is a list of objects, each object defines a split section.
    There are four types of splits: "sequential", "consequential", "individual" or "manual"
      - "sequential" splits are evaluated in order, all previous sequential splits
          has to be completed before the current sequential split can be checked
      - "consequential" splits are evaluated at any moment, if a consequential split
          is completed, all previous consequential splits are automatically completed
      - "individual" splits are evaluated individually all at the same time, they can
          be completed in any order
      - "manual" splits are completed with key press, in order. "condition" field
          for these splits are ignored

    There is a special split type "fail", which is used to define a fail condition.
      - You can have multiple "fail" splits, all of them will be evaluated each logic tick
      - If any of them is triggered, the timer will be stopped

    The timer will stop once all splits are completed.
  */
  init: function () {
    this.dirURI = this.dir ? 'file:///' + this.dir.replace(/\\/g, '/') : 'ccSplit';
    this.logicTicks = 0;
    this.displayTick = 0;
    this.timerStarted = false;
    this.timerRunning = false;
    this.timerFailed = false;

    this.prepareSplitWindow();

    this.splitData = { name: loc('Not loaded'), splits: [] };
    this.keyBindings = {
      split: {
        name: 'q',
        keyCode: 81,
      },
      unsplit: {
        name: 'w',
        keyCode: 87,
      },
      stop: {
        name: 'p',
        keyCode: 80,
      },
    };
    this.keyState = {};
    this.hash = '';

    Game.registerHook('reset', this.reset.bind(this));
    Game.registerHook('logic', this.logic.bind(this));
    Game.registerHook('draw', this.draw.bind(this));

    this.setupMenuHook();

    this.safeText = function (text) {
      if (text == null) return text;
      this.innerText = this.textContent = text;
      return this.innerHTML.replace(/^\s+|\s+$/g, '');
    }.bind(document.createElement('div'));

    this.keyDown = false;

    const MOD = this;
    AddEvent(window, 'keydown', function (e) {
      for (let keyFunc in MOD.keyBindings) {
        if (e.keyCode == MOD.keyBindings[keyFunc].keyCode) {
          MOD.keyState[keyFunc] = true;
          break;
        }
      }
    });
  },

  reset: function (wipe) {
    if (wipe) {
      this.logicTicks = 0;
      this.timerRunning = true;
      this.timerStarted = true;
      for (const split of this.splitData.splits) {
        split.completed = null;
      }
    } else {
      // The logic where Game.T resets to 0 is independent from Game.Logic / Game.Loop
      //   so Game.T won't increase when Game.Reset() is called
      // But I think it make sense to count the reincarnate action as a tick
      //   since a "tick" is technically when the Game.T changes, and
      //   we are changing Game.T from it's original value to zero.
      this.logicTicks++;
    }
  },

  logic: function () {
    this.logicTicks++;

    if (this.timerStarted) {
      if (this.keyState.stop) {
        this.timerRunning = false;
        this.timerStarted = false;
        this.timerFailed = false;
      }
    }

    if (this.timerStarted) {
      if (this.keyState.unsplit) {
        this.unsplit();
      }

      if (this.timerRunning) {
        this.displayTick = this.logicTicks;
        this.checkSplit(this.keyState.split);
        if (this.keyState.stop) {
          this.timerRunning = false;
          this.timerStarted = false;
          this.timerFailed = false;
        }
      }
    }

    // Reset key state
    for (let keyFunc in this.keyState) {
      this.keyState[keyFunc] = false;
    }
  },

  prepareSplitWindow: function () {
    // fancy text
    // text-shadow:0px -1px 1px #09f, 0px 1px 1px #f04;
    // Prepare timer display

    document.head.insertAdjacentHTML(
      'beforeend',
      '<link href="' + this.dirURI + '/styles.css" rel="stylesheet" type="text/css">'
    );

    l('centerArea').insertAdjacentHTML(
      'afterEnd',
      '<div class="framed" id="srTimerContainer" style="">' +
        '<div id="srTimerTitle"></div>' +
        '<div id="srTimerSplitContainer"></div>' +
        '<div id="srTimerTimer"></div>' +
        '<div id="srTimerExtra"></div>' +
        '</div>'
    );

    this.timerContainerL = l('srTimerContainer');
    this.timerTitleL = l('srTimerTitle');
    this.timerSplitContainer = l('srTimerSplitContainer');
    this.timerL = l('srTimerTimer');
    this.timerExtraL = l('srTimerExtra');
    this.timerSplitsL = [];

    this.openWindow();
  },

  unsplit: function () {
    for (let i = this.splitData.splits.length - 1; i >= 0; i--) {
      const split = this.splitData.splits[i];
      if (split.type == 'manual' && split.completed != null) {
        split.best = split.prevBest;
        split.completed = null;
        if (!this.timerRunning) {
          this.timerRunning = true;
          this.saveSplit();
        }
        break;
      }
    }
  },

  checkSplit: function (manualSplit = false) {
    let lastSequential = null;
    let prevConsequential = [];
    let lastManual = null;
    let complete = true;
    for (let i = 0; i < this.splitData.splits.length; i++) {
      const split = this.splitData.splits[i];
      if (split.type == null || split.type === 'sequential') {
        if (
          split.completed == null &&
          (lastSequential == null || lastSequential.completed) &&
          this.safeEval(split.func)
        ) {
          split.completed = this.logicTicks;
          split.prevBest = split.best;
          split.best = Math.min(split.best ?? Infinity, split.completed);
          this.saveSplit();
        }
        lastSequential = split;
      } else if (split.type === 'consequential') {
        if (split.completed == null && this.safeEval(split.func)) {
          split.completed = this.logicTicks;
          split.prevBest = split.best;
          split.best = Math.min(split.best ?? Infinity, split.completed);
          this.saveSplit();
          for (const prev of prevConsequential) {
            if (!prev.completed) {
              prev.completed = this.logicTicks;
              prev.prevBest = prev.best;
              prev.best = Math.min(prev.best ?? Infinity, prev.completed);
            }
          }
        }
        prevConsequential.push(split);
      } else if (split.type === 'individual') {
        if (split.completed == null && this.safeEval(split.func)) {
          split.completed = this.logicTicks;
          split.prevBest = split.best;
          split.best = Math.min(split.best ?? Infinity, split.completed);
          this.saveSplit();
        }
      } else if (split.type === 'manual') {
        if (
          split.completed == null &&
          (lastManual == null || lastManual.completed) &&
          manualSplit
        ) {
          split.completed = this.logicTicks;
          split.prevBest = split.best;
          split.best = Math.min(split.best ?? Infinity, split.completed);
          manualSplit = false;
          this.saveSplit();
        }
        lastManual = split;
      } else if (split.type === 'fail') {
        if (this.safeEval(split.func)) {
          this.saveSplit();
          split.completed = this.logicTicks;
          this.timerRunning = false;
          this.timerFailed = true;
        }
      }
      if (split.completed == null && split.type !== 'fail') complete = false;
    }

    if (complete && this.timerRunning) {
      this.saveSplit();
      this.timerRunning = false;
    }
  },

  safeEval: function (func) {
    try {
      return func();
    } catch (e) {
      return false;
    }
  },

  draw: function () {
    if (Game.onMenu) {
      this.timerContainerL.style.opacity = 0.3;
    } else {
      this.timerContainerL.style.opacity = 1;
    }

    if (this.timerRunning) {
      this.timerContainerL.style.pointerEvents = 'none';
    } else {
      this.timerContainerL.style.pointerEvents = null;
    }

    let segCount = 0;
    let failCount = 0;

    let foundActiveSeq = -1;
    let foundActiveConS = -1;
    let foundActiveManual = -1;

    for (const split of this.splitData.splits) {
      if (split.type !== 'fail') {
        if (split.completed != null && split.prevBest != null) {
          split.deltaL.innerText = `${
            split.completed <= split.prevBest ? '-' : '+'
          }${this.tickToTime(Math.abs(split.completed - split.prevBest))}`;
        } else {
          split.deltaL.innerText = '';
        }
        split.timeL.innerText = this.tickToTime(split.completed ?? split.best ?? -1);

        if (
          this.timerRunning &&
          foundActiveSeq < 0 &&
          split.type === 'sequential' &&
          split.completed == null
        ) {
          foundActiveSeq = segCount;
          split.lineL.classList.add('sr-active-sequential');
        } else if (split.type === 'sequential') {
          split.lineL.classList.remove('sr-active-sequential');
        }

        if (
          this.timerRunning &&
          foundActiveConS < 0 &&
          split.type === 'consequential' &&
          split.completed == null
        ) {
          foundActiveConS = segCount;
          split.lineL.classList.add('sr-active-consequential');
        } else if (split.type === 'consequential') {
          split.lineL.classList.remove('sr-active-consequential');
        }

        if (
          this.timerRunning &&
          foundActiveManual < 0 &&
          split.type === 'manual' &&
          split.completed == null
        ) {
          foundActiveManual = segCount;
          split.lineL.classList.add('sr-active-manual');
        } else if (split.type === 'manual') {
          split.lineL.classList.remove('sr-active-manual');
        }

        segCount += 1;
      } else {
        if (split.completed != null) {
          split.failL.style.opacity = 1;
        } else {
          split.failL.style.opacity = 0.3;
        }
        failCount += 1;
      }
    }

    if (this.splitData.splits.length === 0) {
      this.timerL.style.color = '#fff';
      this.timerL.style.textShadow = '0px -1px 1px #09f, 0px 1px 1px #f04';
      this.timerL.innerHTML =
        '<span style="font-size:12px;text-align:center;width:100%;display:inline-block">' +
        loc('Please import split data') +
        '</span>';
    } else if (!this.timerStarted) {
      this.timerL.style.color = '#fff';
      this.timerL.style.textShadow = '0px -1px 1px #09f, 0px 1px 1px #f04';
      this.timerL.innerHTML =
        '<span style="font-size:12px;text-align:center;width:100%;display:inline-block">' +
        loc('Wipe save to start') +
        '</span>';
    } else {
      if (this.timerRunning) {
        this.timerL.style.color = '#fff';
        this.timerL.style.textShadow = '0px -1px 1px #09f, 0px 1px 1px #f04';
      } else {
        this.timerL.style.color = '#f33';
        this.timerL.style.textShadow = '';
      }

      this.timerL.innerHTML = `${this.timerFailed ? '[F]' : ''}${this.tickToTime(
        this.displayTick
      )}`;
    }
  },

  export: function () {
    const data = {};
    if (this.splitData.name != null) {
      data.name = this.splitData.name;
    }
    data.splits = [];
    for (const split of this.splitData.splits) {
      const s = {};
      s.type = split.type;

      if (split.name != null) {
        s.name = split.name;
      }

      if (split.type !== 'manual' && split.condition != null) {
        s.condition = split.condition;
      }

      if (split.icon != null) {
        s.icon = split.icon;
      }

      if (split.best != null) {
        s.best = split.best;
      }

      data.splits.push(s);
    }

    return data;
  },

  save: function () {
    return JSON.stringify({
      keyBindings: this.keyBindings,
      splits: this.export(),
    });
  },

  load: function (str) {
    const data = JSON.parse(str);
    this.keyBindings = data.keyBindings;
    this.import(data.splits);
  },

  tickToTime: function (tick) {
    if (tick < 0) return '-';
    const centiseconds = Math.round((tick / Game.fps) * 100);
    let minutes = Math.floor(Math.floor(centiseconds / 100) / 60);
    const seconds = centiseconds / 100 - minutes * 60;
    const hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    return `${hours ? `${hours}:` : ''}${
      hours || minutes ? `${hours > 0 && minutes < 10 ? '0' : ''}${minutes}:` : ''
    }${(hours || minutes > 0) && Math.floor(seconds) < 10 ? '0' : ''}${seconds.toFixed(2)}`;
  },

  button: function (button, text, callback) {
    if (!callback) callback = '';
    callback += "PlaySound('snd/tick.mp3');";
    return (
      '<a class="smallFancyButton option on" style="text-align:center;margin:4px" id="' +
      button +
      '"' +
      Game.clickStr +
      '="' +
      callback +
      '">' +
      text +
      '</a>'
    );
  },

  prefMenu: function () {
    return (
      '<div class="title">Autosplit</div>' +
      '<div class="listing">' +
      '<div style="text-align:center">' +
      this.button('srtImportSplit', 'Import Split Data', 'Game.mods.ccSplit.importPrompt();') +
      this.button('srtExportSplit', 'Export Split Data', 'Game.mods.ccSplit.exportPrompt();') +
      '</div>' +
      '<div class="listing"><b>' +
      'Loaded Split Data:' +
      '</b> ' +
      (this.safeText(this.splitData.name) || `[${loc('Unnamed')}]`) +
      '</div>' +
      '<div class="listing"><b>' +
      'Split Hash:' +
      '</b><span style="user-select: all">' +
      this.hash +
      '</span></div>' +
      '<div class="listing">' +
      this.button('srtClearPB', 'Clear PB', 'Game.mods.ccSplit.clearPB();') +
      '<br>' +
      '</div>' +
      '</div>'
    );
  },

  clearPB: function () {
    if (this.timerStarted) {
      this.timerStarted = false;
      this.timerRunning = false;
      this.timerFailed = false;
    }

    for (const split of this.splitData.splits) {
      if (split.best != null) {
        delete split.completed;
        delete split.best;
      }
    }
  },

  import: function (split) {
    this.hash = '[Calculating Hash]';
    this.timerStarted = false;
    this.timerFailed = false;
    this.timerRunning = false;
    try {
      const data = typeof split == 'string' ? JSON.parse(split) : split;
      if (!this.validateSplit(data)) {
        this.splitHash();
        return false;
      }
      this.splitData = data;
    } catch (e) {
      this.splitHash();
      return false;
    }
    this.splitHash();

    // update split window
    this.timerTitleL.innerHTML = this.splitData.name;

    // remove splits
    while (this.timerSplitContainer.firstChild) {
      this.timerSplitContainer.removeChild(this.timerSplitContainer.firstChild);
    }
    // remove extras
    while (this.timerExtraL.firstChild) {
      this.timerExtraL.removeChild(this.timerExtraL.firstChild);
    }

    let segCount = 0;
    let failCount = 0;
    for (const split of this.splitData.splits) {
      if (split.type !== 'fail') {
        this.timerSplitContainer.insertAdjacentHTML(
          'beforeEnd',
          `<div class="sr-split-line" id="srSegLine${segCount}"><div class="sr-split-desc">${this.icon(
            'class="sr-split-icon"',
            split.icon || [8, 0],
            24
          )}<span class="sr-split-name">${
            split.name || 'Segment ' + segCount.toString()
          }</span></div><span class="sr-split-delta" id="srSegDelta${segCount}"></span><span class="sr-split-time" id="srSegTime${segCount}"></span></div>`
        );
        split.lineL = l(`srSegLine${segCount}`);
        split.deltaL = l(`srSegDelta${segCount}`);
        split.timeL = l(`srSegTime${segCount}`);
        segCount += 1;
      } else {
        this.timerExtraL.insertAdjacentHTML(
          'beforeEnd',
          this.icon(
            `class="sr-fail-icon" id="srFail${failCount}"`,
            split.icon || [1, 7],
            24,
            `<div class="sr-tooltip">${split.name || `Fail cond ${failCount}`}</div>`
          )
        );
        split.failL = l(`srFail${failCount}`);
        failCount += 1;
      }
    }

    this.saveSplit();
    return true;
  },

  icon: function (attr = '', icon = null, size = 48, content = '') {
    return `<span ${attr}
    ${
      icon
        ? `style="${icon[2] ? `background-image:url(${icon[2]});` : ''}${`background-position:${
            -icon[0] * size
          }px ${-icon[1] * size}px;`}"`
        : ''
    }>${content}</span>`;
  },

  importPrompt: function () {
    if (this.hash == '[Calculating Hash]') return;
    Game.Prompt(
      '<h3>' +
        loc('Import split data') +
        '</h3><div class="block">' +
        loc('Please paste your split data.') +
        '<br>' +
        '<a href="#" onclick="App.openLink(\'https://github.com/TsFreddie/CookieAutosplit/tree/master/examples\');">[' +
        loc('Examples') +
        ']</a>' +
        '<div id="importError" class="warning" style="font-weight:bold;font-size:11px;"></div></div><div class="block"><textarea id="textareaPrompt" style="width:100%;height:128px;">' +
        '</textarea></div>',
      [
        [
          loc('Load'),
          "if (l('textareaPrompt').value.length==0){return false;}if (Game.mods.ccSplit.import(l('textareaPrompt').value)){Game.ClosePrompt();}else{l('importError').innerHTML='('+loc(\"Error importing split data\")+')';}",
        ],
        loc('Nevermind'),
      ]
    );
    l('textareaPrompt').focus();
  },

  exportPrompt: function () {
    Game.Prompt(
      '<h3>' +
        loc('Export split data') +
        '</h3><div class="block">' +
        loc(
          'This code contains both your split settings AND your record.<br>Copy it and keep it somewhere safe!'
        ) +
        '</div><div class="block"><textarea id="textareaPrompt" style="width:100%;height:128px;" readonly>' +
        JSON.stringify(this.export()) +
        '</textarea></div>',
      [loc('All done!')]
    ); //prompt('Copy this text and keep it somewhere safe!',Game.WriteSave(1));
    l('textareaPrompt').focus();
    l('textareaPrompt').select();
  },

  saveSplit: function () {
    Game.toSave = true;
  },

  validateSplit: function (splitData) {
    if (splitData == null || !Array.isArray(splitData.splits)) return false;
    if (splitData.splits.length === 0) {
      splitData.name = loc('Not loaded');
    }
    for (const split of splitData.splits) {
      if (split.type == null) {
        if (typeof split.condition == 'string') {
          split.type = 'consequential';
        } else {
          split.type = 'manual';
          delete split.condition;
        }
      }
      if (
        split.type === 'sequential' ||
        split.type === 'consequential' ||
        split.type === 'individual' ||
        split.type === 'fail'
      ) {
        if (typeof split.condition !== 'string') return false;
        try {
          split.func = new Function(`return (${split.condition})`);
        } catch (e) {
          return false;
        }
      } else if (split.type !== 'manual') {
        return false;
      }

      if (split.icon != null) {
        if (!Array.isArray(split.icon)) return false;
        if (typeof split.icon[0] != 'number') return false;
        if (typeof split.icon[1] != 'number') return false;
        if (split.icon[2] != null && typeof split.icon[2] != 'string') return false;
      }

      if (split.best != null && typeof split.best != 'number') return false;
    }
    return true;
  },

  splitHash: async function () {
    if (this.splitData.splits.length === 0) {
      this.hash = '';
      return '';
    }

    const hashStr = [];
    for (const split of this.splitData.splits) {
      hashStr.push(`${split.type}|${split.condition}`);
    }
    const msgBuffer = new TextEncoder().encode(hashStr.join('|'));

    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    this.hash = hashHex;
    Game.UpdateMenu();
    return hashHex;
  },

  setupMenuHook: function () {
    if (typeof CCSE == 'undefined') {
      const oldMenu = Game.UpdateMenu;
      const MOD = this;
      Game.UpdateMenu = function () {
        oldMenu();
        if (Game.onMenu == 'prefs') {
          let menuHTML = l('menu').innerHTML;
          menuHTML = menuHTML.replace(
            '<div style="height:128px;"></div>',
            '<div class="framed" style="margin:4px 48px;"><div class="block" style="padding:0px;margin:8px 4px;"><div class="subsection" style="padding:0px;">' +
              MOD.prefMenu() +
              '</div></div></div><div style="height:128px;"></div>'
          );
          menu.innerHTML = menuHTML;
        }
      };
    } else {
      if (Game.customOptionsMenu == null) {
        Game.customOptionsMenu = [];
      }
      Game.customOptionsMenu.push(() => {
        CCSE.AppendOptionsMenu(this.prefMenu());
      });
    }
  },

  openWindow: function () {
    if (this.splitWin && !this.splitWin.closed) return;
    this.splitWin = window.open(
      `${this.dirURI}/splitWindow.html`,
      'Autosplit',
      'top=500,left=200,width=200,height=300,frame=false,nodeIntegration=no,autoHideMenuBar=true,alwaysOnTop=true,titleBarStyle=customButtonsOnHover'
    );
  },

  closeWindow: function () {
    if (this.splitWin) {
      this.splitWin.close();
      this.splitWin = null;
    }
  },
});
