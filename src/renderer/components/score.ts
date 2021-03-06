import game from 'core/game'

export default class ComponentScore {
  private lbl : Phaser.Text

  create() {
    this.lbl = game.add.text(0, 10, '0', {
      fontSize: '16px',
      fill: 0x000000
    });
    this.lbl.y = 10;
    this.lbl.setTextBounds(50, 0, 46, 32);
    this.lbl.boundsAlignH = 'right';
    this.lbl.align        = 'right';
    this.lbl.lineSpacing  = -7;
  }

  update(chain,score) {
    let text  = `${score}`;
    if (chain) { text += `\nchain: ${chain+1}`; }
    this.lbl.setText(text);
  }
}
