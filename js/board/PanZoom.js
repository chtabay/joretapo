export default class PanZoom {
  constructor(svgElement) {
    this.svg = svgElement;
    this.viewBox = { x: 0, y: 0, w: 750, h: 900 };
    this._initialViewBox = { ...this.viewBox };

    this._isPanning = false;
    this._startPoint = null;
    this._startViewBox = null;
    this._pinchStartDist = null;
    this._pinchStartVB = null;

    this._bindEvents();
  }

  reset() {
    this.viewBox = { ...this._initialViewBox };
    this._applyViewBox();
  }

  _bindEvents() {
    this.svg.addEventListener('pointerdown', e => this._onPointerDown(e));
    this.svg.addEventListener('pointermove', e => this._onPointerMove(e));
    this.svg.addEventListener('pointerup', e => this._onPointerUp(e));
    this.svg.addEventListener('pointercancel', e => this._onPointerUp(e));
    this.svg.addEventListener('wheel', e => this._onWheel(e), { passive: false });

    this.svg.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    this.svg.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
    this.svg.addEventListener('touchend', e => this._onTouchEnd(e));
  }

  _onPointerDown(e) {
    if (e.pointerType === 'touch') return;
    this._isPanning = true;
    this._startPoint = this._svgPoint(e);
    this._startViewBox = { ...this.viewBox };
    this.svg.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this._isPanning || e.pointerType === 'touch') return;
    const p = this._svgPoint(e);
    this.viewBox.x = this._startViewBox.x - (p.x - this._startPoint.x);
    this.viewBox.y = this._startViewBox.y - (p.y - this._startPoint.y);
    this._applyViewBox();
  }

  _onPointerUp(e) {
    this._isPanning = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    this._zoomAt(e, scale);
  }

  _onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      this._pinchStartDist = this._touchDist(e.touches);
      this._pinchStartVB = { ...this.viewBox };
    } else if (e.touches.length === 1) {
      this._isPanning = true;
      this._startPoint = this._svgPointFromTouch(e.touches[0]);
      this._startViewBox = { ...this.viewBox };
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 2 && this._pinchStartDist) {
      e.preventDefault();
      const dist = this._touchDist(e.touches);
      const scale = this._pinchStartDist / dist;

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const rect = this.svg.getBoundingClientRect();
      const normX = (midX - rect.left) / rect.width;
      const normY = (midY - rect.top) / rect.height;

      const newW = Math.max(150, Math.min(1500, this._pinchStartVB.w * scale));
      const newH = Math.max(180, Math.min(1800, this._pinchStartVB.h * scale));

      this.viewBox.x = this._pinchStartVB.x + (this._pinchStartVB.w - newW) * normX;
      this.viewBox.y = this._pinchStartVB.y + (this._pinchStartVB.h - newH) * normY;
      this.viewBox.w = newW;
      this.viewBox.h = newH;
      this._applyViewBox();

    } else if (e.touches.length === 1 && this._isPanning) {
      e.preventDefault();
      const p = this._svgPointFromTouch(e.touches[0]);
      this.viewBox.x = this._startViewBox.x - (p.x - this._startPoint.x);
      this.viewBox.y = this._startViewBox.y - (p.y - this._startPoint.y);
      this._applyViewBox();
    }
  }

  _onTouchEnd(e) {
    if (e.touches.length < 2) {
      this._pinchStartDist = null;
      this._pinchStartVB = null;
    }
    if (e.touches.length === 0) {
      this._isPanning = false;
    }
  }

  _zoomAt(e, scale) {
    const rect = this.svg.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    const newW = Math.max(150, Math.min(1500, this.viewBox.w * scale));
    const newH = Math.max(180, Math.min(1800, this.viewBox.h * scale));

    this.viewBox.x += (this.viewBox.w - newW) * normX;
    this.viewBox.y += (this.viewBox.h - newH) * normY;
    this.viewBox.w = newW;
    this.viewBox.h = newH;
    this._applyViewBox();
  }

  _svgPoint(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: this.viewBox.x + (e.clientX - rect.left) / rect.width * this.viewBox.w,
      y: this.viewBox.y + (e.clientY - rect.top) / rect.height * this.viewBox.h
    };
  }

  _svgPointFromTouch(touch) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: this.viewBox.x + (touch.clientX - rect.left) / rect.width * this.viewBox.w,
      y: this.viewBox.y + (touch.clientY - rect.top) / rect.height * this.viewBox.h
    };
  }

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _applyViewBox() {
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
  }
}
