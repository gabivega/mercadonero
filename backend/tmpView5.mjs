import sharp from 'sharp';
const base='C:/dev/mercadonero/frontend/public/assets/img/';
const out='tmp-logos/';
(async()=>{
 const casos=[
  ['monero-logo-mobile.png',300],
  ['MERCADO NERO NARANJA&N 1.png',600],
  ['logo-black.png',600],
  ['mercado-nero-logo-full-white.png',600],
 ];
 for(const [f,w] of casos){
  try{
   const r=await sharp(base+f).resize({width:w}).png().toBuffer();
   const m=await sharp(r).metadata();
   const bg=await sharp({create:{width:m.width+60,height:m.height+60,channels:3,background:'#0b0b0f'}})
     .composite([{input:r,top:30,left:30}]).png().toBuffer();
   await sharp(bg).toFile(out+'CMP-'+(f.split('.')[0].replace(/[^a-z0-9]/gi,'_'))+'.png');
   // % de pixeles claros (visibilidad sobre fondo oscuro)
   await sharp({create:{width:m.width,height:m.height,channels:3,background:'#0b0b0f'}})
     .composite([{input:r}]).greyscale().raw().toBuffer({resolveWithObject:true})
     .then(({data})=>{let b=0;for(let i=0;i<data.length;i++)if(data[i]>140)b++;
       console.log(f.padEnd(42),m.width+'x'+m.height,'claros:',(b/data.length*100).toFixed(1)+'%');});
  }catch(e){console.log(f,'ERR',e.message)}
 }
})();
