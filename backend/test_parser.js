require('dotenv').config();
const path = require('path');
const fs = require('fs');
const aiService = require('./src/services/ai.service');

async function test() {
  const dir = path.resolve('./uploads/resumes');
  const files = fs.readdirSync(dir);
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtime.getTime() - fs.statSync(path.join(dir, a)).mtime.getTime());
  const latest = files[0];
  const resumeAbsPath = path.join(dir, latest);
  
  console.log('Testing resume:', latest);
  try {
    const data = await aiService.parseResumeWithAI(resumeAbsPath);
    console.log(JSON.stringify(data, null, 2));
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}

test();
