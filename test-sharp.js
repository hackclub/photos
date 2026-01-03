const sharp = require('sharp');

async function testSharp() {
  try {
    const image = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 }
      }
    })
    .png()
    .toBuffer();
    
    console.log('Sharp generated a buffer of length:', image.length);
    
    const resized = await sharp(image)
      .resize(50, 50)
      .toBuffer();
      
    console.log('Sharp resized buffer to length:', resized.length);
    console.log('Sharp is working correctly.');
  } catch (err) {
    console.error('Sharp failed:', err);
  }
}

testSharp();
