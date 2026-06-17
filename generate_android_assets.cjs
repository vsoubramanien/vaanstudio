const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Paths
const sourceImage = path.join(__dirname, 'src/assets/images/vaan_music_icon_1781708830928.jpg');
const assetsDir = path.join(__dirname, 'assets');
const resDir = path.join(__dirname, 'android/app/src/main/res');

// Configuration
const bgColor = '#090c15'; // Sleek dark slate color of Vaan Music Player

// Ensure assets directories exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

// Density maps for Launcher Icons
const iconSizes = {
  ldpi: { size: 36, adaptiveSize: 81 },
  mdpi: { size: 48, adaptiveSize: 108 },
  hdpi: { size: 72, adaptiveSize: 162 },
  xhdpi: { size: 96, adaptiveSize: 216 },
  xxhdpi: { size: 144, adaptiveSize: 324 },
  xxxhdpi: { size: 192, adaptiveSize: 432 }
};

// Density maps for Splash Screens
const splashSizes = {
  ldpi: { w: 320, h: 180 },
  mdpi: { w: 480, h: 270 },
  hdpi: { w: 640, h: 360 },
  xhdpi: { w: 960, h: 540 },
  xxhdpi: { w: 1280, h: 720 },
  xxxhdpi: { w: 1920, h: 1080 }
};

async function createLauncherIcons() {
  console.log("Generating Launcher Icons...");
  
  // 1. Root assets first
  await sharp(sourceImage).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(sourceImage).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-only.png'));
  
  // Foreground for adaptive icons (logo scaled down to 60% of size centered on transit backdrop)
  const fgSize = 1024;
  const logoScaledSize = Math.floor(fgSize * 0.6);
  const logoScaled = await sharp(sourceImage).resize(logoScaledSize, logoScaledSize).toBuffer();
  await sharp({
    create: {
      width: fgSize,
      height: fgSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{ input: logoScaled, gravity: 'center' }])
  .png()
  .toFile(path.join(assetsDir, 'icon-foreground.png'));

  // 2. Android Density Folders
  for (const [density, config] of Object.entries(iconSizes)) {
    const mipmapFolder = path.join(resDir, `mipmap-${density}`);
    if (!fs.existsSync(mipmapFolder)) {
      fs.mkdirSync(mipmapFolder, { recursive: true });
    }

    // Standard Icon: Square squircle
    await sharp(sourceImage)
      .resize(config.size, config.size)
      .png()
      .toFile(path.join(mipmapFolder, 'ic_launcher.png'));

    // Circular Icon: Rounded mask
    const radius = config.size / 2;
    const svgMask = Buffer.from(
      `<svg><circle cx="${radius}" cy="${radius}" r="${radius}" fill="black"/></svg>`
    );
    await sharp(sourceImage)
      .resize(config.size, config.size)
      .composite([{ input: svgMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(mipmapFolder, 'ic_launcher_round.png'));

    // Adaptive Icon Background: Solid color
    await sharp({
      create: {
        width: config.adaptiveSize,
        height: config.adaptiveSize,
        channels: 4,
        background: bgColor
      }
    })
    .png()
    .toFile(path.join(mipmapFolder, 'ic_launcher_background.png'));

    // Adaptive Icon Foreground: Centered logo inside safe zone (approx. 60% size)
    const adaptiveLogoSize = Math.floor(config.adaptiveSize * 0.6);
    const adaptiveLogoResized = await sharp(sourceImage).resize(adaptiveLogoSize, adaptiveLogoSize).toBuffer();
    
    await sharp({
      create: {
        width: config.adaptiveSize,
        height: config.adaptiveSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{ input: adaptiveLogoResized, gravity: 'center' }])
    .png()
    .toFile(path.join(mipmapFolder, 'ic_launcher_foreground.png'));

    console.log(`✓ Mipmap ${density} complete.`);
  }
}

async function createSplashScreens() {
  console.log("\nGenerating Splash Screens...");
  
  // Read res folder to find all directories that should contain splash.png
  const dirs = fs.readdirSync(resDir);
  const splashSubdirs = dirs.filter(d => d.startsWith('drawable'));
  
  for (const dirName of splashSubdirs) {
    const fullDirPath = path.join(resDir, dirName);
    const isLand = dirName.includes('land');
    const isNight = dirName.includes('night');
    
    // Determine target density for dimension lookups
    let density = 'mdpi';
    if (dirName.includes('xxxhdpi')) density = 'xxxhdpi';
    else if (dirName.includes('xxhdpi')) density = 'xxhdpi';
    else if (dirName.includes('xhdpi')) density = 'xhdpi';
    else if (dirName.includes('hdpi')) density = 'hdpi';
    else if (dirName.includes('ldpi')) density = 'ldpi';
    
    const config = splashSizes[density] || { w: 480, h: 270 };
    
    // Determine canvas orientation
    const w = isLand ? Math.max(config.w, config.h) : Math.min(config.w, config.h);
    const h = isLand ? Math.min(config.w, config.h) : Math.max(config.w, config.h);
    
    // Size of the centered logo (approx. 1/3 of the screen width/height, max 300)
    const logoSize = Math.max(32, Math.min(Math.floor(Math.min(w, h) * 0.35), 300));
    
    const logoBuffer = await sharp(sourceImage)
      .resize(logoSize, logoSize)
      .toBuffer();
      
    await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: bgColor
      }
    })
    .composite([{ input: logoBuffer, gravity: 'center' }])
    .png()
    .toFile(path.join(fullDirPath, 'splash.png'));
    
    console.log(`✓ Splash in ${dirName} (${w}x${h}) complete.`);
  }
}

async function run() {
  try {
    await createLauncherIcons();
    await createSplashScreens();
    console.log("\n>>> ALL ASSETS SUCCESSFULLY REGENERATED! <<<");
  } catch (error) {
    console.error("Asset generation failed:", error);
  }
}

run();
