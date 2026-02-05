import { useEffect, useRef } from "react";
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from "ogl";

import "./CircularGallery.css";

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function lerp(p1, p2, t) {
  return p1 + (p2 - p1) * t;
}

function autoBind(instance) {
  const proto = Object.getPrototypeOf(instance);
  Object.getOwnPropertyNames(proto).forEach((key) => {
    if (key !== "constructor" && typeof instance[key] === "function") {
      instance[key] = instance[key].bind(instance);
    }
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createTextTexture(gl, text, font = "600 22px 'Work Sans', sans-serif", color = "#5f4e45") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { texture: new Texture(gl, { generateMipmaps: false }), width: 0, height: 0 };

  const lines = String(text || "").split("\n");
  context.font = font;
  const widths = lines.map((line) => context.measureText(line).width);
  const textWidth = Math.ceil(Math.max(0, ...widths));
  const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
  const fontSize = sizeMatch ? Number(sizeMatch[1]) : 22;
  const lineHeight = Math.ceil(fontSize * 1.2);
  const textHeight = Math.ceil(lineHeight * Math.max(1, lines.length));
  const paddingX = Math.ceil(fontSize * 1.2);
  const paddingY = Math.ceil(fontSize * 0.8);

  canvas.width = textWidth + paddingX * 2;
  canvas.height = textHeight + paddingY * 2;

  context.font = font;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const radius = Math.min(canvas.height, canvas.width) * 0.18;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.18)";
  context.shadowBlur = fontSize * 0.6;
  context.shadowOffsetY = fontSize * 0.2;
  context.fillStyle = "rgba(247, 241, 234, 0.92)";
  drawRoundedRect(context, 0, 0, canvas.width, canvas.height, radius);
  context.fill();
  context.restore();

  context.strokeStyle = "rgba(90, 78, 69, 0.18)";
  context.lineWidth = 1;
  drawRoundedRect(context, 0.5, 0.5, canvas.width - 1, canvas.height - 1, radius - 0.5);
  context.stroke();

  context.fillStyle = color;
  context.textBaseline = "middle";
  context.textAlign = "left";
  lines.forEach((line, idx) => {
    const y = paddingY + lineHeight / 2 + idx * lineHeight;
    context.fillText(line, paddingX, y);
  });

  const texture = new Texture(gl, { generateMipmaps: false });
  texture.image = canvas;
  return { texture, width: canvas.width, height: canvas.height };
}

class Title {
  constructor({ gl, plane, renderer, text, textColor = "#545050", font = "600 22px 'Work Sans', sans-serif" }) {
    autoBind(this);
    this.gl = gl;
    this.plane = plane;
    this.renderer = renderer;
    this.text = text;
    this.textColor = textColor;
    this.font = font;
    this.createMesh();
  }

  createMesh() {
    const { texture, width, height } = createTextTexture(this.gl, this.text, this.font, this.textColor);
    const geometry = new Plane(this.gl);
    const program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: `
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tMap, vUv);
          if (color.a < 0.1) discard;
          gl_FragColor = color;
        }
      `,
      uniforms: { tMap: { value: texture } },
      transparent: true,
    });

    this.mesh = new Mesh(this.gl, { geometry, program, renderOrder: 2 });
    const aspect = width / height || 1;
    const lineCount = String(this.text || "").split("\n").length || 1;
    let labelHeight = this.plane.scale.y * (0.12 * lineCount + 0.03);
    let labelWidth = labelHeight * aspect;
    const padX = this.plane.scale.x * 0.06;
    const padY = this.plane.scale.y * 0.08;
    const maxWidth = this.plane.scale.x - padX * 2;
    if (labelWidth > maxWidth && maxWidth > 0) {
      const scale = maxWidth / labelWidth;
      labelWidth *= scale;
      labelHeight *= scale;
    }
    this.mesh.scale.set(labelWidth, labelHeight, 1);
    this.mesh.position.x = -this.plane.scale.x * 0.5 + labelWidth * 0.5 + padX;
    this.mesh.position.y = -this.plane.scale.y * 0.5 + labelHeight * 0.5 + padY;
    this.mesh.position.z = 0.02;
    this.mesh.setParent(this.plane);
  }
}

class Media {
  constructor({
    geometry,
    gl,
    image,
    index,
    length,
    renderer,
    scene,
    screen,
    text,
    viewport,
    bend,
    textColor,
    borderRadius = 0,
    font,
  }) {
    this.extra = 0;
    this.geometry = geometry;
    this.gl = gl;
    this.image = image;
    this.index = index;
    this.length = length;
    this.renderer = renderer;
    this.scene = scene;
    this.screen = screen;
    this.text = text;
    this.viewport = viewport;
    this.bend = bend;
    this.textColor = textColor;
    this.borderRadius = borderRadius;
    this.font = font;
    this.createShader();
    this.createMesh();
    this.createTitle();
    this.onResize();
  }

  createShader() {
    const texture = new Texture(this.gl, { generateMipmaps: false });
    this.program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (0.1 + uSpeed * 0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        varying vec2 vUv;

        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }

        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = texture2D(tMap, uv);

          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          if (d > 0.0) {
            discard;
          }

          gl_FragColor = vec4(color.rgb, 1.0);
        }
      `,
      uniforms: {
        tMap: { value: texture },
        uPlaneSizes: { value: [0, 0] },
        uImageSizes: { value: [0, 0] },
        uSpeed: { value: 0 },
        uTime: { value: 100 * Math.random() },
        uBorderRadius: { value: this.borderRadius },
      },
      transparent: true,
    });

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = this.image;
    img.onload = () => {
      texture.image = img;
      this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
    };
  }

  createMesh() {
    this.plane = new Mesh(this.gl, {
      geometry: this.geometry,
      program: this.program,
    });
    this.plane.setParent(this.scene);
  }

  createTitle() {
    this.title = new Title({
      gl: this.gl,
      plane: this.plane,
      renderer: this.renderer,
      text: this.text,
      textColor: this.textColor,
      font: this.font,
    });
  }

  update(scroll, direction) {
    this.plane.position.x = this.x - scroll.current - this.extra;

    const x = this.plane.position.x;
    const H = this.viewport.width / 2;

    if (this.bend === 0) {
      this.plane.position.y = 0;
      this.plane.rotation.z = 0;
    } else {
      const B_abs = Math.abs(this.bend);
      const R = (H * H + B_abs * B_abs) / (2 * B_abs);
      const effectiveX = Math.min(Math.abs(x), H);

      const arc = R - Math.sqrt(R * R - effectiveX * effectiveX);
      if (this.bend > 0) {
        this.plane.position.y = -arc;
        this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
      } else {
        this.plane.position.y = arc;
        this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
      }
    }

    this.speed = scroll.current - scroll.last;
    this.program.uniforms.uTime.value += 0.04;
    this.program.uniforms.uSpeed.value = this.speed;

    const planeOffset = this.plane.scale.x / 2;
    const viewportOffset = this.viewport.width / 2;
    this.isBefore = this.plane.position.x + planeOffset < -viewportOffset;
    this.isAfter = this.plane.position.x - planeOffset > viewportOffset;
    if (direction === "right" && this.isBefore) {
      this.extra -= this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
    if (direction === "left" && this.isAfter) {
      this.extra += this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
  }

  onResize({ screen, viewport } = {}) {
    if (screen) this.screen = screen;
    if (viewport) {
      this.viewport = viewport;
      if (this.plane.program.uniforms.uViewportSizes) {
        this.plane.program.uniforms.uViewportSizes.value = [this.viewport.width, this.viewport.height];
      }
    }
    this.scale = this.screen.height / 1500;
    this.plane.scale.y = (this.viewport.height * (900 * this.scale)) / this.screen.height;
    this.plane.scale.x = (this.viewport.width * (700 * this.scale)) / this.screen.width;
    this.plane.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    this.padding = 2;
    this.width = this.plane.scale.x + this.padding;
    this.widthTotal = this.width * this.length;
    this.x = this.width * this.index;
  }
}

class App {
  constructor(
    container,
    {
      items,
      bend,
      textColor = "#5f4e45",
      borderRadius = 0.08,
      font = "600 22px 'Work Sans', sans-serif",
      onSelect,
      useFallback = true,
    } = {},
  ) {
    if (!container) return;
    document.documentElement.classList.remove("no-js");
    this.container = container;
    this.scroll = { ease: 0.05, current: 0, target: 0, last: 0 };
    this.onCheckDebounce = debounce(this.onCheck, 200);
    this.onItemSelect = typeof onSelect === "function" ? onSelect : null;
    this.itemsCount = 0;
    this.dragged = false;
    this.dragThreshold = 6;
    this.lastPointerX = 0;
    this.createRenderer();
    this.createCamera();
    this.createScene();
    this.onResize();
    this.createGeometry();
    this.createMedias(items, bend, textColor, borderRadius, font, useFallback);
    this.update();
    this.addEventListeners();
  }

  createRenderer() {
    this.renderer = new Renderer({ alpha: true });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.container.appendChild(this.gl.canvas);
  }

  createCamera() {
    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;
  }

  createScene() {
    this.scene = new Transform();
  }

  createGeometry() {
    this.planeGeometry = new Plane(this.gl, {
      heightSegments: 50,
      widthSegments: 100,
    });
  }

  createMedias(items, bend = 1, textColor, borderRadius, font, useFallback = true) {
    const defaultItems = [
      { image: "https://picsum.photos/seed/1/800/600?grayscale", text: "Bridge" },
      { image: "https://picsum.photos/seed/2/800/600?grayscale", text: "Desk Setup" },
      { image: "https://picsum.photos/seed/3/800/600?grayscale", text: "Waterfall" },
      { image: "https://picsum.photos/seed/4/800/600?grayscale", text: "Strawberries" },
      { image: "https://picsum.photos/seed/5/800/600?grayscale", text: "Deep Diving" },
      { image: "https://picsum.photos/seed/16/800/600?grayscale", text: "Train Track" },
      { image: "https://picsum.photos/seed/17/800/600?grayscale", text: "Santorini" },
      { image: "https://picsum.photos/seed/8/800/600?grayscale", text: "Blurry Lights" },
      { image: "https://picsum.photos/seed/9/800/600?grayscale", text: "New York" },
      { image: "https://picsum.photos/seed/10/800/600?grayscale", text: "Good Boy" },
      { image: "https://picsum.photos/seed/21/800/600?grayscale", text: "Coastline" },
      { image: "https://picsum.photos/seed/12/800/600?grayscale", text: "Palm Trees" },
    ];

    const galleryItems = items && items.length ? items : useFallback ? defaultItems : [];
    this.itemsCount = galleryItems.length;
    this.mediasImages = galleryItems.concat(galleryItems);
    this.medias = this.mediasImages.map((data, index) =>
      new Media({
        geometry: this.planeGeometry,
        gl: this.gl,
        image: data.image,
        index,
        length: this.mediasImages.length,
        renderer: this.renderer,
        scene: this.scene,
        screen: this.screen,
        text: data.text,
        viewport: this.viewport,
        bend,
        textColor,
        borderRadius,
        font,
      }),
    );
    if (this.medias.length) {
      const width = this.medias[0].width;
      const center = width * (this.medias.length / 2);
      this.scroll.current = center;
      this.scroll.target = center;
      this.scroll.last = center;
    }
  }

  onTouchDown(e) {
    this.isDown = true;
    this.dragged = false;
    this.scroll.position = this.scroll.current;
    this.start = e.touches ? e.touches[0].clientX : e.clientX;
    this.lastPointerX = this.start;
  }

  onTouchMove(e) {
    if (!this.isDown) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    if (Math.abs(this.start - x) > this.dragThreshold) {
      this.dragged = true;
    }
    this.lastPointerX = x;
    const distance = (this.start - x) * 0.05;
    this.scroll.target = this.scroll.position + distance;
  }

  onTouchUp() {
    if (!this.isDown) return;
    this.isDown = false;
    this.onCheck();
    if (!this.dragged && this.onItemSelect && this.itemsCount) {
      const index = this.getItemIndexFromPointer(this.lastPointerX);
      if (Number.isFinite(index)) this.onItemSelect(index);
    }
  }

  onWheel() {
    this.scroll.target += 2;
    this.onCheckDebounce();
  }

  onCheck() {
    if (!this.medias || !this.medias[0]) return;
    const width = this.medias[0].width;
    const itemIndex = Math.round(Math.abs(this.scroll.target) / width);
    const item = width * itemIndex;
    this.scroll.target = this.scroll.target < 0 ? -item : item;
  }

  getItemIndexFromPointer(clientX) {
    if (!this.medias || !this.medias.length || !this.itemsCount || !this.screen || !this.viewport) return null;
    const x = (clientX / this.screen.width) * this.viewport.width - this.viewport.width / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;
    this.medias.forEach((media, idx) => {
      const distance = Math.abs(media.plane.position.x - x);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = idx;
      }
    });
    return closestIndex % this.itemsCount;
  }

  onResize() {
    this.screen = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({
      aspect: this.screen.width / this.screen.height,
    });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    const width = height * this.camera.aspect;
    this.viewport = { width, height };
    if (this.medias) {
      this.medias.forEach((media) => media.onResize({ screen: this.screen, viewport: this.viewport }));
    }
  }

  update() {
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    const direction = this.scroll.current > this.scroll.last ? "right" : "left";
    if (this.medias) {
      this.medias.forEach((media) => media.update(this.scroll, direction));
    }
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.raf = window.requestAnimationFrame(this.update.bind(this));
  }

  addEventListeners() {
    this.boundOnResize = this.onResize.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnTouchDown = this.onTouchDown.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchUp = this.onTouchUp.bind(this);
    window.addEventListener("resize", this.boundOnResize);
    if (this.container) {
      this.container.addEventListener("mousewheel", this.boundOnWheel);
      this.container.addEventListener("wheel", this.boundOnWheel);
      this.container.addEventListener("mousedown", this.boundOnTouchDown);
      this.container.addEventListener("touchstart", this.boundOnTouchDown);
    }
    window.addEventListener("mousemove", this.boundOnTouchMove);
    window.addEventListener("mouseup", this.boundOnTouchUp);
    window.addEventListener("touchmove", this.boundOnTouchMove);
    window.addEventListener("touchend", this.boundOnTouchUp);
  }

  destroy() {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.boundOnResize);
    if (this.container) {
      this.container.removeEventListener("mousewheel", this.boundOnWheel);
      this.container.removeEventListener("wheel", this.boundOnWheel);
      this.container.removeEventListener("mousedown", this.boundOnTouchDown);
      this.container.removeEventListener("touchstart", this.boundOnTouchDown);
    }
    window.removeEventListener("mousemove", this.boundOnTouchMove);
    window.removeEventListener("mouseup", this.boundOnTouchUp);
    window.removeEventListener("touchmove", this.boundOnTouchMove);
    window.removeEventListener("touchend", this.boundOnTouchUp);
    if (this.renderer && this.renderer.gl && this.renderer.gl.canvas.parentNode) {
      this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas);
    }
  }
}

export default function CircularGallery({
  items,
  bend = 0,
  textColor = "#5f4e45",
  borderRadius = 0.05,
  font = "600 22px 'Work Sans', sans-serif",
  onSelect,
  useFallback = true,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const app = new App(containerRef.current, { items, bend, textColor, borderRadius, font, onSelect, useFallback });
    return () => {
      if (app && app.destroy) app.destroy();
    };
  }, [items, bend, textColor, borderRadius, font, onSelect, useFallback]);

  return <div className="circular-gallery" ref={containerRef} />;
}
