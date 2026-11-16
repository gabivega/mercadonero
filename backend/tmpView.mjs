import sharp from 'sharp';
const base='C:/dev/mercadonero/frontend/public/assets/img/';
const files=['mercado-nero-logo-full-white.png','mercado-nero-logo.png','monero-transparent-white.png','mn-logo-light.png'];
const out='tmp-logos/';
(async()=>{
 for(const f of files){
  const name=f.replace('.png','');
  const meta=await sharp(base+f).metadata();
  // Escalamos a ancho 520 y la ponemos sobre el fondo del kit
  const resized=await sharp(base+f).resize({width:520}).png().toBuffer();
  const rm=await sharp(resized).metadata();
  await sharp({create:{width:700,height:220,channels:3,background:'#0b0b0f'}})
   .composite([{input:resized, gravity:'center'}])
   .png().toFile(out+'prev-'+name+'.png');
  console.log(name.padEnd(34), 'orig', meta.width+'x'+meta.height, '-> escalado', rm.width+'x'+rm.height);
 }
})();
