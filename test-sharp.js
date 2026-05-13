const pino = require("pino");
const sharp = require("sharp");

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

async function testSharp() {
  try {
    const image = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    logger.info({ length: image.length }, "Sharp generated a buffer of length");

    const resized = await sharp(image).resize(50, 50).toBuffer();

    logger.info({ length: resized.length }, "Sharp resized buffer to length");
    logger.info("Sharp is working correctly.");
  } catch (err) {
    logger.error({ err }, "Sharp failed");
  }
}

testSharp();
