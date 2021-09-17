Game.registerMod('CCSplit', {
  // Split schema
  /* 
    Split data is a list of objects, each object defines a split.
    There are four types of splits: "sequential", "consequential", "individual" or "manual"
      - "sequential" splits are evaluated in order, all previous sequential splits
          has to be completed before the current sequential split can be checked
      - "consequential" splits are evaluated at any moment, if a consequential split
          is completed, all previous consequential splits are automatically completed
      - "individual" splits are evaluated individually all at the same time, they can
          be completed in any order
      - "manual" splits are completed with key press, in order. "condition" field
          for these splits are ignored

    The timer will stop once all splits are completed.

    [
      {
        "name": String,
        "condition": String (Javascript expression),
        "type": "sequential" | "consequential" | "individual" | "manual"
      },
      ...
    ]
  */
  init: function () {
    this.logicTicks = 0;
    this.displayTick = 0;
    this.timerStarted = false;
    this.timerRunning = false;

    this.lastKeyPress = false;

    // Prepare timer display
    l('centerArea').insertAdjacentHTML(
      'afterEnd',
      '<div class="framed" id="srTimer" style="text-align:right;position:absolute;z-index:1000000000;min-width:145px;left:16px;min-height:1em;bottom:0px;pointer-events:none;font-size:24px;font-weight:bold;font-family:Courier,monospace;color:#fff;text-shadow:0px -1px 1px #09f, 0px 1px 1px #f04;"></div>'
    );
    this.timerL = l('srTimer');

    this.split = [];

    Game.registerHook('reset', this.reset.bind(this));
    Game.registerHook('logic', this.logic.bind(this));
    Game.registerHook('draw', this.draw.bind(this));
  },

  reset: function (wipe) {
    if (wipe) {
      this.logicTicks = 0;
      this.timerRunning = true;
      this.timerStarted = true;
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
    this.displayTick = this.logicTicks;
  },

  draw: function () {
    if (!this.timerStarted) {
      this.timerL.style.color = '#fff';
      this.timerL.style.textShadow = '0px -1px 1px #09f, 0px 1px 1px #f04';
      this.timerL.innerHTML =
        '<span style="font-size:12px;text-align:center;width:100%;display:inline-block">Wipe save to start</span>';
    } else {
      if (this.timerRunning) {
        this.timerL.style.color = '#fff';
        this.timerL.style.textShadow = '0px -1px 1px #09f, 0px 1px 1px #f04';
      } else {
        this.timerL.style.color = '#f33';
        this.timerL.style.textShadow = '';
      }

      const centiseconds = Math.round((this.displayTick / Game.fps) * 100);
      let minutes = Math.floor(Math.floor(centiseconds / 100) / 60);
      const seconds = centiseconds / 100 - minutes * 60;
      const hours = Math.floor(minutes / 60);
      minutes = minutes % 60;
      this.timerL.innerHTML = `${hours ? `${hours}:` : ''}${
        hours || minutes ? `${hours > 0 && minutes < 10 ? '0' : ''}${minutes}:` : ''
      }${(hours || minutes > 0) && Math.floor(seconds) < 10 ? '0' : ''}${seconds.toFixed(2)}`;
    }
  },

  stop: function () {
    this.timerRunning = false;
  },
});
