import sharp from 'sharp';
import fs from 'fs';
const base='C:/dev/mercadonero/frontend/public/assets/img/';
(async()=>{
 for(const f of fs.readdirSync(base)){
  if(!/\.(png|webp|jpg)$/i.test(f))continue;
  try{
   const m=await sharp(base+f).metadata();
   // Nos interesan los que tengan aspecto de "logo horizontal con icono"
   const ratio=(m.width/m.height).toFixed(2);
   console.log(f.padEnd(50), m.width+'x'+m.height, 'ratio',ratio,'alpha',m.hasAlpha);
  }catch(e){}
 }
})();
