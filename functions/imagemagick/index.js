/**
 * Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// [START functions_imagemagick_setup]
const gm = require('gm').subClass({imageMagick: true});
const fs = require('fs');
const path = require('path');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const vision = require('@google-cloud/vision').v1p1beta1;

const client = new vision.ImageAnnotatorClient();

const {BLURRED_BUCKET_NAME} = process.env;
// [END functions_imagemagick_setup]

// [START functions_imagemagick_analyze]
// Blurs uploaded images that are flagged as Adult or Violence.
exports.blurOffensiveImages = async event => {
  const object = event;

  const file = storage.bucket(object.bucket).file(object.name);
  const filePath = `gs://${object.bucket}/${object.name}`;

  console.log(`Analyzing ${file.name}.`);

  try {
    const [result] = await client.safeSearchDetection(filePath);
    const detections = result.safeSearchAnnotation;

    if (
      detections.adult === 'VERY_LIKELY' ||
      detections.violence === 'VERY_LIKELY'
    ) {
      console.log(`The image ${file.name} has been detected as inappropriate.`);
      return blurImage(file, BLURRED_BUCKET_NAME);
    } else {
      console.log(`The image ${file.name} has been detected as OK.`);
    }
  } catch (err) {
    console.error(`Failed to analyze ${file.name}.`, err);
    return Promise.reject(err);
  }
};
// [END functions_imagemagick_analyze]

// [START functions_imagemagick_blur]
// Blurs the given file using ImageMagick, and uploads it to another bucket.
const blurImage = async (file, blurredBucketName) => {
  const tempLocalPath = `/tmp/${path.parse(file.name).base}`;

  // Download file from bucket.
  try {
    await file.download({destination: tempLocalPath});

    console.log(`Image ${file.name} has been downloaded to ${tempLocalPath}.`);
  } catch (err) {
    console.error('Failed to download file.', err);
    return Promise.reject(err);
  }

  try {
    // Blur the image using ImageMagick.
    await new Promise((resolve, reject) => {
      gm(tempLocalPath)
        .blur(0, 16)
        .write(tempLocalPath, (err, stdout) => {
          if (err) {
            console.error('Failed to blur image.', err);
            return reject(err);
          } else {
            resolve(stdout);
          }
        });
    });
    console.log(`Image ${file.name} has been blurred.`);
  } catch (err) {
    console.error('Failed to blur image.', err);
    return Promise.reject(err);
  }

  // Upload result to a different bucket, to avoid re-triggering this function.
  // You can also re-upload it to the same bucket + tell your Cloud Function to
  // ignore files marked as blurred (e.g. those with a "blurred" prefix)
  const blurredBucket = storage.bucket(blurredBucketName);

  // Upload the Blurred image back into the bucket.
  try {
    await blurredBucket.upload(tempLocalPath, {destination: file.name});
    console.log(
      `Blurred image has been uploaded to: gs://${blurredBucketName}/${file.name}`
    );
  } catch (err) {
    console.error('Failed to upload blurred image.', err);
    return Promise.reject(err);
  }

  // Delete the temporary file.
  return new Promise((resolve, reject) => {
    fs.unlink(tempLocalPath, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
// [END functions_imagemagick_blur]
