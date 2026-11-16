import sharp from 'sharp';
const base='C:/dev/mercadonero/frontend/public/assets/img/';
(async()=>{
 const r=await sharp(base+'monero-logo-mobile.png').resize({width:700}).png().toBuffer();
 const m=await sharp(r).metadata();
 await sharp({create:{width:760,height:m.height+60,channels:3,background:'#141420'}})
  .composite([{input:r,top:30,left:30}]).png().toFile('tmp-logos/VER-monero-mobile.png');
 console.log('monero-logo-mobile ->',m.width+'x'+m.height);

 // Tambien la version naranja que puede tener icono+texto
 const r2=await sharp(base+'MERCADO NERO NARANJA&N 1.png').resize({width:700}).png().toBuffer();
 const m2=await sharp(r2).metadata();
 await sharp({create:{width:760,height:m2.height+60,channels:3,background:'#141420'}})
  .composite([{input:r2,top:30,left:30}]).png().toFile('tmp-logos/VER-naranja.png');
 console.log('NARANJA&N 1 ->',m2.width+'x'+m2.height);
})();
