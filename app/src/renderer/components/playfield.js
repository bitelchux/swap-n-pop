module.exports = function(game){
  const APP = require('../../../app')('../../../')
  const _f = require(APP.path.core('filters'))
  const ss = require('shuffle-seed')
  const ComponentPlayfieldCountdown = require(APP.path.components('playfield_countdown'))(game)
  const ComponentPlayfieldCursor    = require(APP.path.components('playfield_cursor'))(game)
  const ComponentPlayfieldWall      = require(APP.path.components('playfield_wall'))(game)
  const ComponentScore              = require(APP.path.components('score'))(game)
  const ComponentPanel              = require(APP.path.components('panel'))(game)
  const ComponentAi                 = require(APP.path.components('ai'))(game)
  const {
    ROWS,
    COLS,
    PANELS,
    UNIT,
    TIME_PUSH,
    SCAN_BTLR
  } = require(APP.path.core('data'))

  class controller {
    get [Symbol.toStringTag](){ return 'Playfield' }
    static initClass() {
      this.prototype.history = {};
      this.prototype.pi          = null  // player number, used to detect input
      this.prototype.unit        = null
      this.prototype.rows        = null
      this.prototype.cols        = null
      this.prototype.combo       = null
      this.prototype.chain       = null
      this.prototype.cursor      = null
      this.prototype.blank       = null
      this.prototype.clearing    = null
      this.prototype.score       = 0
      this.prototype.scoreText   = null
      this.prototype.has_ai      = false
      this.prototype.land        = false
       // when any panel has landed in the stac
    }
    constructor(pi){
      if (pi !== 0 && pi !== 1){ 
        throw new Error("player_number present and must be 0 or 1")
      }
      this.create   = this.create.bind(this)
      this.update   = this.update.bind(this)
      this.render   = this.render.bind(this)
      this.shutdown = this.shutdown.bind(this)

      this.load = this.load.bind(this)

      this.create_after = this.create_after.bind(this);
      this.create_stack = this.create_stack.bind(this);
      this.push = this.push.bind(this);
      this.game_over = this.game_over.bind(this);
      this.create_newline = this.create_newline.bind(this);
      this.create_panels = this.create_panels.bind(this);
      this.fill_panels = this.fill_panels.bind(this);
      this.update_stack = this.update_stack.bind(this);
      this.chain_and_combo = this.chain_and_combo.bind(this);
      this.swap = this.swap.bind(this);
      this.danger = this.danger.bind(this);
      this.chain_over    = this.chain_over.bind(this);
      this.update_push   = this.update_push.bind(this);
      this.score_current = this.score_current.bind(this);
      this.render_stack  = this.render_stack.bind(this);
      this.stack         = this.stack.bind(this);
      this.queue_garbage = this.queue_garbage.bind(this);

      this.pi = pi
      this.countdown  = new ComponentPlayfieldCountdown()
      this.cursor     = new ComponentPlayfieldCursor()
      this.wall       = new ComponentPlayfieldWall()
      this.score_lbl  = new ComponentScore()
      this.ai         = new ComponentAi()
    }

    get push_counter(){ return this._push_counter }
    set push_counter(v){ this._push_counter = v }
    get pushing(){ return this._pushing }
    set pushing(v){ this._pushing = v }

    stack(v1=null,v2=null){
      if (v1 >= 0 && v2 >= 0 && v1 !== null && v2 !== null) {
        return this._stack[_f.xy2i(v1,v2)]
      } else if (v1 >= 0 && v1 !== null && v2 === null) {
        return this._stack[v1]
      } else if(v1 === null && v2 === null){
        return this._stack
      } else {
        throw(new Error('invalid query to stack'))
      }
    }
    get snap() {
      const snap_cursor = this.cursor.snap
      const snap_countdown = this.countdown.snap
      const snap_stack  = []
      for (let panel of this.stack()){
        snap_stack.push(panel.snap)
      }
      return [
        this.push_counter,
        snap_cursor,
        snap_stack,
        snap_countdown,
        this.pushing
      ]
    }
    load(snapshot){
      this.push_counter = snapshot[0]
      this.cursor.load(   snapshot[1])
      for (let i = 0; i < this.stack_len; i++) {
        this.stack(i).load(snapshot[2][i])
      }
      this.countdown.load(snapshot[3])
      this.pushing = snapshot[4]
    }
    create(stage,opts){
      if (stage === null) {
        throw new Error("must pass stage")
      }
      if (opts           === null ||
          opts.x         === null ||
          opts.y         === null ||
          opts.countdown === null ||
          opts.panel     === null){
        throw new Error("must pass at least x,y,countdown and panels")
      }


      this.stage            = stage
      this.should_push      = opts.push      || false
      this.should_countdown = opts.countdown || false

      this.height = (ROWS+1) * UNIT
      this.width  = COLS     * UNIT

      this.x = opts.x
      this.y = opts.y
      const ch = ss.shuffle(['00','01','02','03',
                             '04','05','06','07',
                             '08','09','10','11','12'],
                             this.stage.rng())
      this.bg = game.add.sprite(this.x+48, this.y-1, `playfield_char${ch[0]}`)
      this.bg.anchor.set(0.5,0)
      if (this.pi === 0) {
        this.bg.scale.x = -1
      }

      this.layer_block  = game.add.group()
      this.layer_block.x  = this.x
      this.layer_block.y  = this.y

      this.create_stack(opts.panels)

      this.score       = 0
      this.chain       = 0
      this.push_counter = TIME_PUSH

      this.score_lbl.create()
    }
    create_after() {
      this.layer_cursor = game.add.group()
      this.layer_cursor.x = this.x
      this.layer_cursor.y = this.y

      this.countdown.create(this)
      this.cursor.create(this)
      if (this.has_ai) { this.ai.create(this, this.cursor) }
      this.wall.create(this,this.x,this.y)
    }
    create_stack(data){
      this._stack = []
      this.create_panels()
      this.fill_panels(data)
    }

    get stack_len(){
      return this._stack.length
    }
    get stack_size(){
      return this.should_push ? this.stack_len-COLS : this.stack_len
    }

    queue_garbage(chain){
      console.log('queue garbage chain', chain)
    }
    push() {
      let i;
      if (this.danger(0)) {
        this.stage.game_over()
        return 0
      }

      // move all panels up the stack
      const stack = new Array(this.stack_len)
      for (i = COLS; i < this.stack_len; i++) {
        let [x,y] = Array.from(_f.i2xy(i-COLS))
        stack[i-COLS] = this._stack[i]
        stack[i-COLS].x = x
        stack[i-COLS].y = y
      }
      this._stack = stack

      this.create_newline()

      if (this.cursor.y > 0) { this.cursor.y--; }
      return 1
    }
    create_newline(mode){
      if (!this.should_push) { return; }
      const rows = (ROWS + (this.should_push ? 1 : 0 ))

      // create panels
      for (let i = PANELS; i < PANELS+COLS; i++){
        const [x,y] = Array.from(_f.i2xy(i))
        this._stack[i] = new ComponentPanel()
        this.stack(i).create(this, x, y)
      }
      // fill panels
      for (let i = PANELS; i < PANELS+COLS; i++){
        this.stack(i).set('unique')
      }
    }

    game_over() {
      this.stage.state = 'gameover'
      this.push_counter = 0
    }

    create_panels(){
      const rows = (ROWS + (this.should_push === true ? 1 : 0 ))
      const size = COLS * rows
      this._stack = new Array().fill(null)

      for (let i = 0; i < size; i++){
        const [x,y] = Array.from(_f.i2xy(i))
        this._stack[i] = new ComponentPanel()
        this.stack(i).create(this, x, y)
      }
    }
    fill_panels(data){
      for (let i = 0; i < data.length; i++) {
        this.stack(i).set(data[i])
      }

      if (this.should_push){
        for (let i = PANELS; i < PANELS+COLS; i++){
          this.stack(i).set('unique')
        }
      }
    }
    update_stack() {
      for (let i of SCAN_BTLR){
        this.stack(i).update()
      }
    }
    chain_and_combo() {
      let i, panel
      let combo = 0
      let chain = false

      this.clearing = []
      for (i = 0; i < this.stack_size; i++) {
        const cnc  = this.stack(i).chain_and_combo()
        combo += cnc[0]
        if (cnc[1]) { chain  = true; }
      }

      for (let panel of this.clearing){
        panel.popping(this.clearing.length)
      }

      if (this.chain && this.chain_over()) { this.chain = 0; }
      return [combo, chain]
    }
    swap(x,y){
      if (this.stack(x,y).swappable && this.stack(x+1,y).swappable) {
        this.stack(x,y).swap()
      }
    }
    // Checks if the current chain is over.
    // returns a boolean
    chain_over() {
      let chain = true;
      for (let panel of this.stack()) {
        if (panel.chain > 0) { chain = false; }
      }
      return chain;
    }
    danger(within){
      const offset = COLS*within;
      const cols   = [];
      for (let i = 0; i < COLS; i++){
        if (this.stack(offset+i)         &&
           (this.stack(offset+i).kind >= 0) &&
           (this.stack(offset+i).kind !== null)) {
          cols.push(i)
        }
      }
      if (cols.length > 0) { return cols; } else { return false; }
    }
    /* The tick function is the main function of the TaGame object.
     * It gets called every tick and executes the other internal functions.
     * It will update the grid,
     * calculate the current score,
     * spawn possible garbage,
     * updates the sprites to the correct locations in the canvas.
     */
    update_push() {
      if (this.pushing) {
        this.push_counter -= 100
      } else {
        this.push_counter--
      }
      if (this.push_counter <= 0) {
        this.pushing        = false
        this.push_counter   = TIME_PUSH
        this.score         += this.push()
      }
    }
    score_combo(combo){
      switch (combo) {
        case 4: return 20;
        case 5: return 30;
        case 6: return 50;
        case 7: return 60;
        case 8: return 70;
        case 9: return 80;
        case 10: return 100;
        case 11: return 140;
        case 12: return 170;
        default:
          return 0;
      }
    }
    score_chain(chain){
      switch (chain) {
        case 2:  return 50;
        case 3:  return 80;
        case 4:  return 150;
        case 5:  return 300;
        case 6:  return 400;
        case 7:  return 500;
        case 8:  return 700;
        case 9:  return 900;
        case 10: return 1100;
        case 11: return 1300;
        case 12: return 1500;
        case 13: return 1800;
        default:
          return 0;
      }
    }
    score_current(cnc){
      if (cnc[0] > 0) {
        console.log('combo is ', cnc);
        this.score += cnc[0] * 10;
        this.score += this.score_combo(cnc[0]);
        if (cnc[1]) {
          this.chain++;
          if (this.pi === 0) {
            this.stage.playfield1.queue_garbage(this.chain+1)
          } else {
            this.stage.playfield0.queue_garbage(this.chain+1)
          }
          console.log('chain is ', this.chain + 1);
        }
        if (this.chain) {
          this.score += this.score_chain(this.chain + 1);
        }
        console.log('Score: ', this.score);
      }
    }
    render_stack() {
      for (let panel of this.stack()){
        panel.render()
      }
    }
    render() {
      this.cursor.render()
      this.wall.render()
      this.render_stack()

      if (this.should_push) {
        const lift = this.y + ((this.push_counter / TIME_PUSH) * UNIT)
        this.layer_block.y  = lift;
        this.layer_cursor.y = lift;
      }
    }
    update() {
      this.countdown.update()
      this.cursor.update()
      this.score_lbl.update(this.chain, this.score)

      if (this.stage.state === 'gameover') {
        this.wall.update()
      }
      if (this.stage.state !== 'running') { return; }

      if (this.should_push) { this.update_push() }
      this.update_stack()
      if (this.has_ai) { this.ai.update() }
      // combo n chain
      const cnc = this.chain_and_combo()
      this.score_current(cnc)

      if (this.land === true) {
        game.sounds.land()
        this.land = false
      }
    }
    shutdown() {
      return this.cursor.shutdown()
    }
  }
  controller.initClass()

  return controller
}
