import sharp from 'sharp';
const base='C:/dev/mercadonero/frontend/public/assets/img/';
(async()=>{
 // Analizamos la distribucion horizontal de tinta del logo _full_white:
 // si el PRIMER 20% del ancho tiene contenido aislado, es el icono.
 const buf=await sharp(base+'mercado-nero-logo-full-white.png')
   .resize({width:500}).flatten({background:'#000000'}).greyscale().raw()
   .toBuffer({resolveWithObject:true});
 const {data,info}=buf;
 const cols=new Array(info.width).fill(0);
 for(let x=0;x<info.width;x++){let s=0;for(let y=0;y<info.height;y++){s+=data[y*info.width+x];}cols[x]=s/info.height;}
 // imprimimos en barras de 50 columnas
 let out='';
 for(let i=0;i<cols.length;i+=10){const avg=cols.slice(i,i+10).reduce((a,b)=>a+b,0)/10;out+=avg>40?'#':avg>15?'+':'.';}
 console.log('perfil de tinta (0-500px):');
 console.log(out);
 console.log('ancho total:',info.width,'alto:',info.height);
})();
