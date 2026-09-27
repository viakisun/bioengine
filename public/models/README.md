# Detection models

This directory holds ONNX model files served at `/models/*.onnx`. The repo
ships **no model binaries** — they are large and quickly stale.

## Phenotyping Survey — ONNX YOLOv8 detector

The `OnnxYoloDetector` (`src/scenarios/phenotyping/detectors/onnxYoloDetector.ts`)
loads `yolov8n.onnx` from this directory on first survey run.

### Quick start: download COCO-pretrained YOLOv8n

```bash
# Option A: Ultralytics (Python) - exports official weights to ONNX
pip install ultralytics
yolo export model=yolov8n.pt format=onnx opset=12 simplify=True
mv yolov8n.onnx public/models/

# Option B: Direct download from ultralytics releases (~12 MB)
curl -L -o public/models/yolov8n.onnx \
  https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.onnx
```

Verify:

```bash
ls -lh public/models/yolov8n.onnx
# -rw-r--r--  1 user  staff  12M ...  yolov8n.onnx
```

### Two-stage pipeline (instance + ripeness)

YOLO returns *instance* bboxes only. Any hit on COCO fruit classes (`apple
47`, `orange 49`, `banana 46`, `carrot 53`) is accepted as a tomato candidate
— without inferring ripeness from the class id. Ripeness is then assigned by
`classifyRipeness()` (`detectors/ripenessClassifier.ts`), which does an HSV
histogram on the pixels inside each bbox and picks the dominant of 5 bins
(green / breaker / turning / pink / red).

Why split it: standalone color segmentation can't tell green tomatoes from
green leaves. Instance detection excludes leaves first, so HSV on the bbox
interior reliably distinguishes the 5 ripeness stages.

### Future: fine-tuned tomato model

Replace `yolov8n.onnx` with a model trained on a real tomato dataset
(MinneApple, TomatoOD, or custom). Update `FRUIT_CLASS_IDS` in
`onnxYoloDetector.ts` to whatever class ids the new model uses for tomato.
The ripeness classifier needs no changes — it works on any bbox.

### Other detectors (no model needed)

- `HsvDetector` — pixel color thresholding, zero dependencies.
- `GroundTruthDetector` — reads simulator state directly. Useful for
  comparing CV results against ground truth.

Switch between detectors in Settings → Detection algorithm.
