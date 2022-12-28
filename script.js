const contentWidth = 640;
const contentHeight = 480;
const canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');

let indexes = {
  'pickWrist' : 10,
  'pickElbow' : 8,
  'fretWrist' : 9,
};

const parts = {
  'pickForearm' : {},
  'wrist' : {},
  'waist' : {},
  'shoulder' : {}
}

let lastPickPos;


// returns true if the line from (a,b)->(c,d) intersects with (p,q)->(r,s)
const intersects = (a,b,c,d,p,q,r,s) =>{
  var det, gamma, lambda;
  det = (c - a) * (s - q) - (r - p) * (d - b);
  if (det === 0) {
    return false;
  } else {
    lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
    gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  }
};

const findNewPoint = (x, y, radians, distance)=>{
  var result = {};
  result.x = Math.round(Math.cos(radians) * distance + x);
  result.y = Math.round(Math.sin(radians) * distance + y);
  return result;
}
  
const getRadians = (x1, y1, x2, y2) => {
  return Math.atan2(y2 - y1, x2 - x1);
}

async function start() {
  canvas.width = contentWidth;
  canvas.height = contentHeight;
  ctx.translate(contentWidth, 0); 
  ctx.scale(-1, 1);
  const net = await posenet.load();
  let video;
  try {
      video = await loadVideo();
  } catch (e) {
      console.error(e);
      return;
  }
  detectPoseInRealTime(video, net);
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();
  return video;
}

async function setupCamera() {
  const video = document.getElementById('video');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const stream = await navigator.mediaDevices.getUserMedia({
      'audio': false,
      'video': {
        width: contentWidth, 
        height: contentHeight 
      }
    });
    video.width = contentWidth;
    video.height = contentHeight;
    video.srcObject = stream;
    return new Promise(resolve => {
      video.onloadedmetadata = () => {
        resolve(video);
      };
    });
  } else {
    const errorMessage = "This browser does not support video capture or this device does not have a camera :)";
    alert(errorMessage);
    return Promise.reject(errorMessage);
  }
}

let dist, player, pitchShift, playChord;

const startAudio = () =>{
  // audio
  dist = new Tone.Distortion(1).toDestination();

  player = new Tone.Player("simple-bass-88983.mp3").connect(dist).sync().start(0);
  player = new Tone.Player("electric-bass-guitar-loop-2-bpm-110-43631.mp3").connect(dist).sync().start(0);
  player = new Tone.Player("bass-g1-93233.mp3").connect(dist).sync().start(0);
  pitchShift = new Tone.PitchShift({
    pitch: 0
  }).toMaster();
  player.connect(pitchShift);
  playChord = () => {
    Tone.Transport.stop();
    Tone.Transport.start();
  }
}


function detectPoseInRealTime(video, net) {
  document.querySelector('#overlay div h2').remove();

  el = document.createElement('h2');
  eltxt = document.createTextNode('🎸 Air Guitar');
  el.appendChild(eltxt);
  document.querySelector("#overlay div").appendChild(el);

  el = document.createElement('p');
  eltxt = document.createTextNode('Stand in a spot where the camera can see your hands, as well as both of your arms. Your left arm controls the pitch of the notes, the further away it is from your body, the lower the notes. Move your right hand up and down to strum the strings.');
  el.appendChild(eltxt);
  document.querySelector("#overlay div").appendChild(el);

  btn = document.createElement('button');
  btnTxt = document.createTextNode('START');
  btn.appendChild(btnTxt);
  document.querySelector("#overlay div").appendChild(btn);

  btn.addEventListener('click', () => {
    document.querySelector('.overlay.active').classList.remove('active');
    startAudio();
  });

  async function poseDetectionFrame() {
    const pose = await net.estimateSinglePose(video, 0.5, false, 16);
    playGuitar(pose.keypoints);
    requestAnimationFrame(poseDetectionFrame);
  }
  poseDetectionFrame();
}

const line = (x1, y1,x2,y2,strokeStyle, strokeWidth) =>{
  ctx.strokeStyle = strokeStyle;
  ctx.strokeWidth = strokeWidth;
  ctx.beginPath();       
  ctx.moveTo(x1, y1);    
  ctx.lineTo(x2, y2);  
  ctx.stroke();
}

const ellipse = (x,y,radius, hex) =>{
  ctx.fillStyle  =  hex;
  ctx.beginPath();
  ctx.arc(x, y, radius, radius, 0, 2 * Math.PI);
  ctx.fill();
}

function playGuitar(points){
  ctx.clearRect(0, 0, contentWidth, contentHeight);
  ctx.drawImage(video, 0, 0, contentWidth, contentHeight);
  if(points[indexes.fretWrist].score>0.4 && points[indexes.pickWrist].score > 0.4){

    // remove the instructions


    parts.wrist = points[indexes.fretWrist].position;
    parts.pickForearm.x1 = points[indexes.pickElbow].position.x;
    parts.pickForearm.y1 = points[indexes.pickElbow].position.y;
    parts.pickForearm.x2 = points[indexes.pickWrist].position.x;
    parts.pickForearm.y2 = points[indexes.pickWrist].position.y;
    parts.shoulder = points[5].position;
    parts.waist.x1 = points[11].position.x;
    parts.waist.y1 = points[11].position.y;
    parts.waist.x2 = points[12].position.x;
    parts.waist.y2 = points[12].position.y;

    // guestimate the position of the pick
    pickRatio = Math.hypot(parts.pickForearm.x2 - parts.pickForearm.x1, parts.pickForearm.y2 - parts.pickForearm.y1) * 0.005;
    pick = {
      x: parts.pickForearm.x2 + (parts.pickForearm.x2 - parts.pickForearm.x1) * pickRatio,
      y: parts.pickForearm.y2 + (parts.pickForearm.y2 - parts.pickForearm.y1) * pickRatio
    };

    // draw the pick
    ellipse(pick.x, pick.y, 10, 'transparent');

    torsoHeight = parts.waist.y1 - parts.shoulder.y;
    hipCenter = {
      x: (parts.waist.x1 + parts.waist.x2)/2, 
      y: (parts.waist.y1 + parts.waist.y2)/2 - torsoHeight * 0.2
    }

    // draw the wrist
    ellipse(parts.wrist.x, parts.wrist.y, 10, 'transparent');

    neckAngle = getRadians(hipCenter.x, hipCenter.y, parts.wrist.x, parts.wrist.y);
    neckStart = findNewPoint(hipCenter.x, hipCenter.y, neckAngle, torsoHeight * 0.3);
    neckEnd = findNewPoint(hipCenter.x, hipCenter.y, neckAngle, torsoHeight * 1.5);
    bridge =  findNewPoint(hipCenter.x, hipCenter.y, neckAngle, torsoHeight * -0.5);

    line(neckStart.x, neckStart.y, neckEnd.x, neckEnd.y, 4, 'transparent');
    line(bridge.x, bridge.y, neckStart.x, neckStart.y, 4, 'transparent');

    if(lastPickPos){
      // returns true if the line from (a,b)->(c,d) intersects with (p,q)->(r,s)
      strummed = intersects(pick.x,pick.y,lastPickPos.x,lastPickPos.y,neckEnd.x,neckEnd.y,bridge.x, bridge.y);
      if(strummed && (pick.y < lastPickPos.y)){
        handPosition = Math.round((1 - Math.sqrt( Math.pow((parts.wrist.x-neckStart.x), 2) + Math.pow((parts.wrist.x-neckStart.y), 2)) / Math.sqrt( Math.pow((neckEnd.x-neckStart.x), 2) + Math.pow((neckEnd.x-neckStart.y), 2)))*22);
        pitchShift.pitch = handPosition;
        playChord();
      }
    }
    lastPickPos = pick;
  }
}  

start();