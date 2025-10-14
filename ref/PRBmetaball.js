
setStepSize(0.65);


let s = getSpace();

let mt = input(0.5,0.01,0.99);

let fn = fractalNoise(s*2.9);

let col = vec3(0.6, 0.0,0.3)*fn*0.2;

shine(fn*2);
metal(0.5);
color(col);

let n = 0.05*noise(4*s);

sphere(0.2);
blend(.1);
displace(mouse.x, mouse.y, 0);
sphere(.3);