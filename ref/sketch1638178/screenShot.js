var img;
function preload(){
  img = loadImage('IMG_6605.JPG');
}
function setup() {
  createCanvas(1112,834);
}

function draw() {
  //images also work as backgrounds
  //background(img);
  //try changing the 4th and 5th parameters
  image(img,0,0, width,height);
}