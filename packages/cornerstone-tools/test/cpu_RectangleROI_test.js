import * as cornerstone3D from '../../cornerstone-render/src/index';
import * as csTools3d from '../src/index';

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  EVENTS,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  eventTarget,
  metaData,
  getEnabledElement,
  createAndCacheVolume,
  registerVolumeLoader,
  setUseCPURenderingOnlyForDebugOrTests,
  resetCPURenderingOnlyForDebugOrTests,
} = cornerstone3D;

const {
  RectangleRoiTool,
  ToolGroupManager,
  getToolState,
  removeToolState,
  CornerstoneTools3DEvents,
  cancelActiveManipulations,
} = csTools3d;

const {
  fakeImageLoader,
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
} = Utilities.testUtils;

const renderingEngineUID = Utilities.uuidv4();

const scene1UID = 'SCENE_1';
const viewportUID = 'VIEWPORT';

const AXIAL = 'AXIAL';

const DOMElements = [];

function createCanvas(renderingEngine, viewportType, width, height) {
  // TODO: currently we need to have a parent div on the canvas with
  // position of relative for the svg layer to be set correctly
  const viewportPane = document.createElement('div');
  viewportPane.style.position = 'relative';
  viewportPane.style.width = `${width}px`;
  viewportPane.style.height = `${height}px`;

  document.body.appendChild(viewportPane);

  const canvas = document.createElement('canvas');

  canvas.style.position = 'absolute';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  viewportPane.appendChild(canvas);

  DOMElements.push(canvas);
  DOMElements.push(viewportPane);

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID,
      type: viewportType,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION[AXIAL],
      },
    },
  ]);
  return canvas;
}

const volumeId = `fakeVolumeLoader:volumeURI_100_100_4_1_1_1_0`;

describe('RectangleRoiTool (CPU):', () => {
  beforeAll(() => {
    setUseCPURenderingOnlyForDebugOrTests(true);
  });

  afterAll(() => {
    resetCPURenderingOnlyForDebugOrTests();
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(RectangleRoiTool, {});
    cache.purgeCache();
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
    this.stackToolGroup.addTool('RectangleRoi', {
      configuration: { volumeUID: volumeId },
    });
    this.stackToolGroup.setToolActive('RectangleRoi', {
      bindings: [{ mouseButton: 1 }],
    });

    this.renderingEngine = new RenderingEngine(renderingEngineUID);
    registerImageLoader('fakeImageLoader', fakeImageLoader);
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    csTools3d.destroy();
    cache.purgeCache();
    eventTarget.reset();
    this.renderingEngine.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroupById('stack');

    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should successfully create a rectangle tool on a cpu stack viewport with mouse drag - 512 x 128', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      512,
      128
    );

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportUID);

    const addEventListenerForAnnotationRendered = () => {
      canvas.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const enabledElement = getEnabledElement(canvas);
          const rectangleToolState = getToolState(
            enabledElement,
            'RectangleRoi'
          );
          // Can successfully add rectangleROI to toolStateManager
          expect(rectangleToolState).toBeDefined();
          expect(rectangleToolState.length).toBe(1);

          const rectangleToolData = rectangleToolState[0];
          expect(rectangleToolData.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          );

          expect(rectangleToolData.metadata.toolName).toBe('RectangleRoi');
          expect(rectangleToolData.data.invalidated).toBe(false);

          const data = rectangleToolData.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          // the rectangle is drawn on the strip
          expect(data[targets[0]].mean).toBe(255);

          removeToolState(canvas, rectangleToolData);
          done();
        }
      );
    };

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 10, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, canvas, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, canvas, vp);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      canvas.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    );

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a rectangle tool on a cpu stack viewport and modify its handle', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      256,
      256
    );

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportUID);

    const addEventListenerForAnnotationRendered = () => {
      canvas.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const enabledElement = getEnabledElement(canvas);
          const rectangleToolState = getToolState(
            enabledElement,
            'RectangleRoi'
          );
          // Can successfully add rectangleROI to toolStateManager
          expect(rectangleToolState).toBeDefined();
          expect(rectangleToolState.length).toBe(1);

          const rectangleToolData = rectangleToolState[0];
          expect(rectangleToolData.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          );
          expect(rectangleToolData.metadata.toolName).toBe('RectangleRoi');
          expect(rectangleToolData.data.invalidated).toBe(false);

          const data = rectangleToolData.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          expect(data[targets[0]].mean).toBe(255);
          expect(data[targets[0]].stdDev).toBe(0);

          removeToolState(canvas, rectangleToolData);
          done();
        }
      );
    };

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 10, 0];
      const index3 = [11, 30, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, canvas, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, canvas, vp);

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, canvas, vp);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      canvas.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      // Select the first handle
      evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      canvas.dispatchEvent(evt);

      // Drag it somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    );

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a rectangle tool on a cpu stack viewport and select but not move it', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      512,
      256
    );

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportUID);

    const addEventListenerForAnnotationRendered = () => {
      canvas.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const enabledElement = getEnabledElement(canvas);
          const rectangleToolState = getToolState(
            enabledElement,
            'RectangleRoi'
          );
          // Can successfully add rectangleROI to toolStateManager
          expect(rectangleToolState).toBeDefined();
          expect(rectangleToolState.length).toBe(1);

          const rectangleToolData = rectangleToolState[0];
          expect(rectangleToolData.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          );
          expect(rectangleToolData.metadata.toolName).toBe('RectangleRoi');
          expect(rectangleToolData.data.invalidated).toBe(false);

          const data = rectangleToolData.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          expect(data[targets[0]].mean).toBe(255);
          expect(data[targets[0]].stdDev).toBe(0);

          removeToolState(canvas, rectangleToolData);
          done();
        }
      );
    };

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 30, 0];

      // grab the tool in its middle (just to make it easy)
      const index3 = [11, 20, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, canvas, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, canvas, vp);

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, canvas, vp);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      canvas.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      // Mouse down on the middle of the rectangleROI, just to select
      evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      canvas.dispatchEvent(evt);

      // Just grab and don't really move it
      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    );

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a rectangle tool on a cpu stack viewport and select AND move it', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      512,
      128
    );

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportUID);

    let p1, p2, p3, p4;

    const addEventListenerForAnnotationRendered = () => {
      canvas.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const enabledElement = getEnabledElement(canvas);
          const rectangleToolState = getToolState(
            enabledElement,
            'RectangleRoi'
          );
          // Can successfully add rectangleROI to toolStateManager
          expect(rectangleToolState).toBeDefined();
          expect(rectangleToolState.length).toBe(1);

          const rectangleToolData = rectangleToolState[0];
          expect(rectangleToolData.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          );
          expect(rectangleToolData.metadata.toolName).toBe('RectangleRoi');
          expect(rectangleToolData.data.invalidated).toBe(false);

          const data = rectangleToolData.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          // We expect the mean to not be 255 as it has been moved
          expect(data[targets[0]].mean).not.toBe(255);
          expect(data[targets[0]].stdDev).not.toBe(0);

          const handles = rectangleToolData.data.handles.points;

          const preMoveFirstHandle = p1;
          const preMoveSecondHandle = p2;
          const preMoveCenter = p3;

          const centerToHandle1 = [
            preMoveCenter[0] - preMoveFirstHandle[0],
            preMoveCenter[1] - preMoveFirstHandle[1],
            preMoveCenter[2] - preMoveFirstHandle[2],
          ];

          const centerToHandle2 = [
            preMoveCenter[0] - preMoveSecondHandle[0],
            preMoveCenter[1] - preMoveSecondHandle[1],
            preMoveCenter[2] - preMoveSecondHandle[2],
          ];

          const afterMoveCenter = p4;

          const afterMoveFirstHandle = [
            afterMoveCenter[0] - centerToHandle1[0],
            afterMoveCenter[1] - centerToHandle1[1],
            afterMoveCenter[2] - centerToHandle1[2],
          ];

          const afterMoveSecondHandle = [
            afterMoveCenter[0] - centerToHandle2[0],
            afterMoveCenter[1] - centerToHandle2[1],
            afterMoveCenter[2] - centerToHandle2[2],
          ];

          // Expect handles are moved accordingly
          expect(handles[0]).toEqual(afterMoveFirstHandle);
          expect(handles[3]).toEqual(afterMoveSecondHandle);

          removeToolState(canvas, rectangleToolData);
          done();
        }
      );
    };

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 30, 0];

      // grab the tool on its left edge
      const index3 = [11, 25, 0];

      // Where to move that grabbing point
      // This will result the tool be outside of the bar
      const index4 = [13, 24, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, canvas, vp);
      p1 = worldCoord1;

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, canvas, vp);
      p2 = worldCoord2;

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, canvas, vp);
      p3 = worldCoord3;

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
        worldCoord: worldCoord4,
      } = createNormalizedMouseEvent(imageData, index4, canvas, vp);
      p4 = worldCoord4;

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      canvas.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      // Drag the middle of the tool
      evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      canvas.dispatchEvent(evt);

      // Move the middle of the tool to point4
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });
      document.dispatchEvent(evt);

      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    );

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a rectangle tool on a cpu stack viewport and select AND move it', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      512,
      128
    );

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportUID);

    let p1, p2, p3, p4;

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 30, 0];

      // grab the tool on its left edge
      const index3 = [11, 25, 0];

      // Where to move that grabbing point
      // This will result the tool be outside of the bar
      const index4 = [13, 24, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, canvas, vp);
      p1 = worldCoord1;

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, canvas, vp);
      p2 = worldCoord2;

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, canvas, vp);
      p3 = worldCoord3;

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
        worldCoord: worldCoord4,
      } = createNormalizedMouseEvent(imageData, index4, canvas, vp);
      p4 = worldCoord4;

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      canvas.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      // Drag the middle of the tool
      evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      canvas.dispatchEvent(evt);

      // Move the middle of the tool to point4
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });
      document.dispatchEvent(evt);

      // Cancel the drawing
      let e = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Esc',
        char: 'Esc',
      });
      canvas.dispatchEvent(e);

      e = new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(e);
    });

    const cancelToolDrawing = () => {
      const canceledDataUID = cancelActiveManipulations(canvas);
      expect(canceledDataUID).toBeDefined();

      setTimeout(() => {
        const enabledElement = getEnabledElement(canvas);
        const rectangleToolState = getToolState(enabledElement, 'RectangleRoi');
        // Can successfully add rectangleROI to toolStateManager
        expect(rectangleToolState).toBeDefined();
        expect(rectangleToolState.length).toBe(1);

        const rectangleToolData = rectangleToolState[0];
        expect(rectangleToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(rectangleToolData.metadata.toolName).toBe('RectangleRoi');
        expect(rectangleToolData.data.invalidated).toBe(false);

        const data = rectangleToolData.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // We expect the mean to not be 255 as it has been moved
        expect(data[targets[0]].mean).not.toBe(255);
        expect(data[targets[0]].stdDev).not.toBe(0);

        const handles = rectangleToolData.data.handles.points;

        const preMoveFirstHandle = p1;
        const preMoveSecondHandle = p2;
        const preMoveCenter = p3;

        const centerToHandle1 = [
          preMoveCenter[0] - preMoveFirstHandle[0],
          preMoveCenter[1] - preMoveFirstHandle[1],
          preMoveCenter[2] - preMoveFirstHandle[2],
        ];

        const centerToHandle2 = [
          preMoveCenter[0] - preMoveSecondHandle[0],
          preMoveCenter[1] - preMoveSecondHandle[1],
          preMoveCenter[2] - preMoveSecondHandle[2],
        ];

        const afterMoveCenter = p4;

        const afterMoveFirstHandle = [
          afterMoveCenter[0] - centerToHandle1[0],
          afterMoveCenter[1] - centerToHandle1[1],
          afterMoveCenter[2] - centerToHandle1[2],
        ];

        const afterMoveSecondHandle = [
          afterMoveCenter[0] - centerToHandle2[0],
          afterMoveCenter[1] - centerToHandle2[1],
          afterMoveCenter[2] - centerToHandle2[2],
        ];

        // Expect handles are moved accordingly
        expect(handles[0]).toEqual(afterMoveFirstHandle);
        expect(handles[3]).toEqual(afterMoveSecondHandle);

        removeToolState(canvas, rectangleToolData);
        done();
      }, 100);
    };

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    );

    canvas.addEventListener(
      CornerstoneTools3DEvents.KEY_DOWN,
      cancelToolDrawing
    );

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });
});