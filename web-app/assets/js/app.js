// SET URL HERE FOR SERVER TO GET TOKEN
let tokenFetchingUrl = "http://localhost:5296/token";

let divId = "MyViewerDiv";
let viewer;
let container;
let sceneBuilder;
let modelBuilder;
let view;
let modelEventStatusById = new Map();

async function setupViewer() {
    let options = {
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        getAccessToken: (onGetAccessToken) => {
            fetch(tokenFetchingUrl)
                .then(response => response.json())
                .then(data => {

                    let accessToken = data["accessToken"];
                    let expireTimeSeconds = data["expiresIn"];
                    onGetAccessToken(accessToken, expireTimeSeconds);
                })
        }
    };
    
    await new Promise(function (resolve, reject) {
        Autodesk.Viewing.Initializer(options, function () {
            resolve();
        });
    });

    const options3d = {
        disabledExtensions: {
          explode:true,
          bimwalk: true,
          section: true
        }
      };

    container = document.getElementById(divId);
    viewer = new Autodesk.Viewing.GuiViewer3D(container, options3d);
    viewer.start();

    await viewer.loadExtension('Autodesk.Viewing.SceneBuilder');
    sceneBuilder = viewer.getExtension('Autodesk.Viewing.SceneBuilder');

    // Create a dummy model first that conserves memory, so that we can avoid the "Model is empty" dialog
    //  This is a workaround provided by Denis Gregor in 5/27/20 email for a bug in the viewer
    await sceneBuilder.addNewModel({ conserveMemory: true });
    modelBuilder = await sceneBuilder.addNewModel({});

    viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeometryLoaded);
    viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, onTreeCreated);

    await addMultipleSvf();

    if (modelEventStatusById.size > 0) {
        console.info('Not all loaded models fired expected events. Checking for expected data.')
        let retry = 1;

        const timer = setInterval(() => {
            if (modelEventStatusById.size > 0) {
                if (retry >= 30) {
                    clearInterval(timer);
                    let remainingModels = getRemainingModels();
                    console.error('Unable to load models: ' + remainingModels);
                } else {
                    console.info(`Not all loaded models fired expected events. Checking for expected data (retry ${retry} -- ${new Date()})`);
                    verifyModelStatus();
                    retry++;
                }
            } else {
                clearInterval(timer);
                console.info('All models fully loaded!');
            }            
        }, 1000);        
    } else {
        console.info('All models fully loaded!');
    }

    viewer.impl.invalidate(true, true);
    resetView();
}

async function addMultipleSvf() {
    for (const modelData of getModelData()) {
        await addSvf(modelData.documentId, viewer, modelData.matrix);
    };
}

async function addSvf(documentId, view, matrixArray) {
    let mx = new THREE.Matrix4();
    mx.fromArray(matrixArray);

    return new Promise((resolve, reject) => {
        let onDocumentLoadSuccess = (doc) => {
            var viewables = doc.getRoot().getDefaultGeometry();

            let opt = {
                placementTransform: mx,
                globalOffset:{x:0,y:0,z:0},
                preserveView: true,
                keepCurrentModels: true
            }

            viewer.loadDocumentNode(doc, viewables, opt).then(model => {
                updateModelEventStatus(model, {
                    documentNodeLoaded: true
                });
            
                resolve()
            });
        }

        let onDocumentLoadFailure = (viewerErrorCode) => {
            console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
            resolve();
            // reject()
        }

        Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);
    })
}

function resetView() {
    resetCamera();

    viewer.addEventListener(Autodesk.Viewing.CAMERA_TRANSITION_COMPLETED, setHomeView);
    viewer.fitToView();

    function setHomeView() {
    viewer.impl['controls'].recordHomeView();
    viewer.removeEventListener(Autodesk.Viewing.CAMERA_TRANSITION_COMPLETED, setHomeView);
    }
}

function resetCamera() {
    const camera = viewer.getCameraFromViewArray([
        1, 1, 1,
        0, 0, 0,
        0, 1, 0,
        this.getAspect(),
        50 * Math.PI / 180,
        60,
        1
    ]);

    viewer.impl.setViewFromCamera(camera, true, true);
}

function getAspect() {
    return container.clientWidth / container.clientHeight;
}

function onGeometryLoaded(event) {
    console.debug('onGeometryLoaded - modelId: ' + event.model.id);
    updateModelEventStatus(event.model, {
        geometryLoaded: true
    });
}

function onTreeCreated(event) {
    console.debug('onTreeCreated - modelId: ' + event.model.id);
    updateModelEventStatus(event.model, {
        objectTreeCreated: true
    });
}

function updateModelEventStatus(model, status) {
    if (model['isSceneBuilder']()) {
      return;
    }

    if (modelEventStatusById.has(model.id)) {
      const existingStatus = modelEventStatusById.get(model.id);

      existingStatus.documentNodeLoaded = existingStatus.documentNodeLoaded || status.documentNodeLoaded;
      existingStatus.geometryLoaded = existingStatus.geometryLoaded || status.geometryLoaded;
      existingStatus.objectTreeCreated = existingStatus.objectTreeCreated || status.objectTreeCreated;

      // If all events (we care about) have been caught for this model, clear the status and fire the observable
      if (existingStatus.documentNodeLoaded && existingStatus.geometryLoaded && existingStatus.objectTreeCreated) {
        modelEventStatusById.delete(model.id);
        modelLoaded(model);
      }
    } else {
        modelEventStatusById.set(model.id, status);
    }
  }

  function verifyModelStatus() {
    let entries = modelEventStatusById.entries();
    let entry = entries.next();
    let eventModelIds = [];
    let allModels = viewer.getAllModels();

    while (!entry.done) {
      eventModelIds.push(entry.value[0]);
      entry = entries.next();
    }

    // Look at all models to see if they have the data we're expecting to be available after the events
    //  fire, in case we somehow missed the events but have the data anyway
    allModels.forEach(m => {
      if (eventModelIds.includes(m.id) && m.getData().instanceTree && viewer.isLoadDone({ onlyModels: [m]})) {
        console.info(`Removing orphaned model event for model ${m.id})`);
        console.info(modelEventStatusById.get(m.id));
        modelEventStatusById.delete(m.id);
        modelLoaded(m);
      }
    });

    // Now look at any remaining modelIds that we have events for and make sure the models exist
    if (modelEventStatusById.size > 0) {
      eventModelIds.forEach(modelId => {
        if (allModels.findIndex(m => m.id === modelId) === -1) {
          console.warn(`model ${modelId} is no longer available`)
          modelEventStatusById.delete(modelId);
        }
      });
    }
}

function modelLoaded(model) {
    console.log(`modelId ${model.id} loaded ${new Date()}`)
}

function getRemainingModels() {
    let modelIds = [];
    let entries = modelEventStatusById.entries();
    let entry = entries.next();

    while (!entry.done) {
        modelIds.push(entry.value[0]);
        entry = entries.next();
    }

    return modelIds;
}