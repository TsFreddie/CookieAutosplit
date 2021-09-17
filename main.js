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
    this.logicTicks = 0;
    this.displayTick = 0;
    this.timerStarted = false;
    this.timerRunning = false;
    this.timerFailed = false;

    this.lastKeyPress = false;

    // Prepare timer display
    l('centerArea').insertAdjacentHTML(
      'afterEnd',
      '<div class="framed" id="srTimer" style="text-align:right;position:absolute;z-index:1000000000;min-width:145px;left:16px;min-height:1em;top:112px;pointer-events:none;font-size:24px;font-weight:bold;font-family:Courier,monospace;color:#fff;text-shadow:0px -1px 1px #09f, 0px 1px 1px #f04;"></div>'
    );
    this.timerL = l('srTimer');

    this.splitData = { name: loc('Not loaded'), splits: [] };
    this.hash = '';
    this.loadSplit();

    Game.registerHook('reset', this.reset.bind(this));
    Game.registerHook('logic', this.logic.bind(this));
    Game.registerHook('draw', this.draw.bind(this));

    this.setupMenuHook();

    this.safeText = function (text) {
      if (text == null) return text;
      this.innerText = this.textContent = text;
      return this.innerHTML.replace(/^\s+|\s+$/g, '');
    }.bind(document.createElement('div'));
  },

  reset: function (wipe) {
    if (wipe) {
      this.logicTicks = 0;
      this.timerRunning = true;
      this.timerStarted = true;
      for (const split of this.splitData.splits) {
        split.completed = false;
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
    if (this.timerStarted && this.timerRunning) {
      this.displayTick = this.logicTicks;
      this.checkSplit();
    } else if (this.timerStarted) {
      // TODO: check key then reset timer
    }
  },

  checkSplit: function (manualSplit = false) {
    let lastSequential = null;
    let prevConsequential = [];
    let lastManual = null;
    let complete = true;
    for (let i = 0; i < this.splitData.splits.length; i++) {
      const split = this.splitData.splits[i];
      if (split.type == null || split.type === 'consequential') {
        if (!split.completed && this.safeEval(split.func)) {
          split.completed = this.logicTicks;
          for (const prev of prevConsequential) {
            if (!prev.completed) prev.completed = this.logicTicks;
          }
        }
        prevConsequential.push(split);
      } else if (split.type === 'sequential') {
        if (
          !split.completed &&
          (lastSequential == null || lastSequential.completed) &&
          this.safeEval(split.func)
        ) {
          split.completed = this.logicTicks;
        }
        lastSequential = split;
      } else if (split.type === 'individual') {
        if (!split.completed && this.safeEval(split.func)) {
          split.completed = this.logicTicks;
        }
      } else if (split.type === 'manual') {
        if (!split.completed && (lastManual == null || lastManual.completed) && manualSplit) {
          split.completed = this.logicTicks;
        }
        lastManual = split;
      } else if (split.type === 'fail') {
        if (this.safeEval(split.func)) {
          this.saveSplit();
          this.timerRunning = false;
          this.timerFailed = false;
        }
      }
      if (!split.completed && split.type !== 'fail') complete = false;
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
      this.timerL.style.opacity = 0.3;
    } else {
      this.timerL.style.opacity = 1;
    }
    if (this.splitData.splits.length === 0) {
      this.timerL.style.color = '#fff';
      this.timerL.style.textShadow = '0px -1px 1px #09f, 0px 1px 1px #f04';
      this.timerL.innerHTML =
        '<span style="font-size:12px;text-align:center;width:100%;display:inline-block">' +
        loc('No splits') +
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

      this.timerL.innerHTML = this.tickToTime(this.displayTick);
    }
  },

  drawSplits: function () {

  },

  tickToTime: function (tick) {
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
      '</b> ' +
      this.hash +
      '</div>' +
      '</div>'
    );
  },

  import: function (splitStr) {
    this.hash = '[Calculating Hash]';
    this.timerStarted = false;
    try {
      const data = JSON.parse(splitStr);
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
    this.saveSplit();
    return true;
  },

  importPrompt: function () {
    if (this.hash == '[Calculating Hash]') return;
    Game.Prompt(
      '<h3>' +
        loc('Import split data') +
        '</h3><div class="block">' +
        loc('Please paste your split data.') +
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
        JSON.stringify(this.splitData) +
        '</textarea></div>',
      [loc('All done!')]
    ); //prompt('Copy this text and keep it somewhere safe!',Game.WriteSave(1));
    l('textareaPrompt').focus();
    l('textareaPrompt').select();
  },

  saveSplit: function () {
    localStorageSet('srTimerSplits', JSON.stringify(this.splitData));
  },

  loadSplit: function() {
    this.hash = '[Calculating Hash]';
    this.timerStarted = false;
    try {
      const splitStr = localStorageGet('srTimerSplits'); 
      const data = JSON.parse(splitStr);
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
    return true;
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
    }
    return true;
  },

  splitHash: async function () {
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
});
