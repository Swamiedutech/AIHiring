const https = require('https');
const fs = require('fs');
const path = require('path');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('Downloaded', dest);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const baseUrl = 'https://justadudewhohacks.github.io/face-api.js/models/';
const models = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1'
];

async function run() {
  await download('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js', 'public/scripts/face-api.min.js');
  for (const model of models) {
    await download(baseUrl + model, 'public/models/' + model);
  }
}
run();
