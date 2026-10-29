'use strict';
(()=>{
 function validate(files){if(files.length>3)throw Error('写真は３枚まで選べます。');for(const f of files)if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size<12||f.size>10485760)throw Error('JPEG・PNG・WebPの写真を、１枚10MB以内で選んでください。');}
 async function prepare(file){
  validate([file]);const bitmap=await createImageBitmap(file);
  try{
   if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>24000000)throw Error('写真の画素数が大きすぎます。小さくして選び直してください。');
   const canvas=document.createElement('canvas');
   for(const size of [1600,1280,960,640]){
    const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [0.85,0.65,0.45]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob?.type==='image/webp'&&blob.size>0&&blob.size<=262144)return blob;}
   }
   throw Error('写真を256KB以内にできませんでした。小さくして選び直してください。');
  }finally{bitmap.close();}
 }
 window.StaffPhotos={validate,prepare};
})();
