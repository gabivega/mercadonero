import sharp from 'sharp';
const base='C:/dev/mercadonero/frontend/public/assets/img/';
const out='tmp-logos/';
(async()=>{
 // El logo principal: mercado-nero-logo-full-white (500x80) => lo escalamos a 460 de ancho
 const W=460;
 const resized=await sharp(base+'mercado-nero-logo-full-white.png').resize({width:W}).png().toBuffer();
 const rm=await sharp(resized).metadata();
 await sharp({create:{width:640,height:200,channels:3,background:'#0b0b0f'}})
  .composite([{input:resized, gravity:'center'}])
  .png().toFile(out+'LOGO-main-on-dark.png');
 console.log('logo en kit:', rm.width+'x'+rm.height);

 // El icono cuadrado (monero-transparent-white 500x500)
 const ic=await sharp(base+'monero-transparent-white.png').resize({height:160}).png().toBuffer();
 const im=await sharp(ic).metadata();
 await sharp({create:{width:300,height:220,channels:3,background:'#0b0b0f'}})
  .composite([{input:ic, gravity:'center'}])
  .png().toFile(out+'LOGO-icon-on-dark.png');
 console.log('icono:', im.width+'x'+im.height);
})();
