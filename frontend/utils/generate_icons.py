import os
from PIL import Image

def remove_background(img):
    """
    Performs a robust BFS-based background removal starting from the 4 corners.
    Since the rounded square icon is surrounded by a light-colored background 
    (with drop shadows) at the corners, we can traverse and key out pixels with
    an average brightness above 135. The dark borders of the rounded square (RGB < 100)
    will act as a barrier, leaving the central logo completely untouched.
    """
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()
    
    # Initialize BFS queue with the four corners
    queue = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    visited = set(queue)
    
    # We use a threshold of 135 for the average of R, G, B channels.
    # The light background is > 180, the shadow transitions down to ~150,
    # and the dark icon border is < 100.
    threshold = 135
    
    background_pixels = []
    
    while queue:
        x, y = queue.pop(0)
        r, g, b, a = pixels[x, y]
        avg = (r + g + b) / 3.0
        
        if avg > threshold:
            background_pixels.append((x, y))
            
            # Check 4-connected neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny))
                    
    print(f"BFS identified {len(background_pixels)} background/shadow pixels to remove.")
    
    # Set all background pixels to transparent
    for x, y in background_pixels:
        pixels[x, y] = (0, 0, 0, 0)
        
    return img

def generate_assets():
    source_path = "images/FitFinity_v02.png"
    assets_dir = "assets"
    
    if not os.path.exists(source_path):
        print(f"Error: Source image not found at {source_path}")
        return
        
    print(f"Loading source image: {source_path}")
    source_img = Image.open(source_path)
    
    # 1. Custom BFS-based Background Keying
    rgba_img = remove_background(source_img)
    
    # Get the tight bounding box of the non-transparent rounded square logo
    bbox = rgba_img.getbbox()
    if not bbox:
        print("Error: Background keying resulted in an empty image!")
        return
        
    print(f"Cropping logo to bounding box: {bbox}")
    cropped_logo = rgba_img.crop(bbox)
    
    # Ensure the cropped logo is a perfect square.
    # If the cropped dimensions are slightly off, we pad it with transparency to make it a perfect square.
    logo_w, logo_h = cropped_logo.size
    side = max(logo_w, logo_h)
    square_logo = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    offset_x = (side - logo_w) // 2
    offset_y = (side - logo_h) // 2
    square_logo.paste(cropped_logo, (offset_x, offset_y))
    
    # Ensure assets directory exists
    os.makedirs(assets_dir, exist_ok=True)
    
    # For Pillow backwards compatibility: use Image.LANCZOS directly
    resample_filter = Image.LANCZOS
    
    # --- A. General App Icon (assets/icon.png) ---
    # Apple requires a fully opaque 1024x1024 square. We will crop the original image 
    # slightly to make it a perfect square, then scale it to 1024x1024.
    print("Generating assets/icon.png (1024x1024, opaque)...")
    orig_w, orig_h = source_img.size
    orig_side = min(orig_w, orig_h)
    crop_x = (orig_w - orig_side) // 2
    crop_y = (orig_h - orig_side) // 2
    square_original = source_img.crop((crop_x, crop_y, crop_x + orig_side, crop_y + orig_side))
    icon_png = square_original.resize((1024, 1024), resample_filter)
    icon_png.convert("RGB").save(os.path.join(assets_dir, "icon.png"), "PNG")
    
    # --- B. Favicon (assets/favicon.png) ---
    # A standard web browser favicon, 48x48 with transparency
    print("Generating assets/favicon.png (48x48, transparent)...")
    favicon_png = square_logo.resize((48, 48), resample_filter)
    favicon_png.save(os.path.join(assets_dir, "favicon.png"), "PNG")
    
    # --- C. Splash Screen Icon (assets/splash-icon.png) ---
    # Center the transparent logo on a 1024x1024 canvas.
    # In app.json, splash screen resizeMode is 'contain' and background is #ffffff.
    print("Generating assets/splash-icon.png (1024x1024, transparent centered)...")
    splash_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    splash_logo_size = 412
    splash_logo = square_logo.resize((splash_logo_size, splash_logo_size), resample_filter)
    splash_canvas.paste(splash_logo, ((1024 - splash_logo_size) // 2, (1024 - splash_logo_size) // 2), splash_logo)
    splash_canvas.save(os.path.join(assets_dir, "splash-icon.png"), "PNG")
    
    # --- D. Android Adaptive Foreground (assets/android-icon-foreground.png) ---
    # Android Adaptive icons must fit the logo inside the 66% safe zone (diameter ~676px).
    # We resize the square transparent logo to 640x640 and center it on a 1024x1024 canvas.
    print("Generating assets/android-icon-foreground.png (1024x1024, transparent, safe zone optimized)...")
    foreground_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    logo_size = 640  # Fits beautifully within the 676px safe-zone
    resized_logo = square_logo.resize((logo_size, logo_size), resample_filter)
    foreground_canvas.paste(resized_logo, ((1024 - logo_size) // 2, (1024 - logo_size) // 2), resized_logo)
    foreground_canvas.save(os.path.join(assets_dir, "android-icon-foreground.png"), "PNG")
    
    # --- E. Android Adaptive Background (assets/android-icon-background.png) ---
    # Solid 1024x1024 matching the light-blue brand accent (#E6F4FE)
    print("Generating assets/android-icon-background.png (1024x1024, solid #E6F4FE)...")
    background_canvas = Image.new("RGBA", (1024, 1024), (230, 244, 254, 255)) # RGB for #E6F4FE
    background_canvas.save(os.path.join(assets_dir, "android-icon-background.png"), "PNG")
    
    # --- F. Android Adaptive Monochrome (assets/android-icon-monochrome.png) ---
    # A single solid slate color (#303030) with transparency matching the foreground shape.
    print("Generating assets/android-icon-monochrome.png (1024x1024, monochrome slate, transparent)...")
    monochrome_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    monochrome_logo = Image.new("RGBA", (logo_size, logo_size), (0, 0, 0, 0))
    
    # Get alpha mask of the resized logo to apply the monochrome color
    _, _, _, alpha = resized_logo.split()
    # Create solid slate color image
    slate_color = Image.new("RGBA", (logo_size, logo_size), (48, 48, 48, 255)) # RGB for #303030
    # Composite using alpha mask
    monochrome_logo.paste(slate_color, (0, 0), alpha)
    
    # Paste centered on canvas
    monochrome_canvas.paste(monochrome_logo, ((1024 - logo_size) // 2, (1024 - logo_size) // 2), monochrome_logo)
    monochrome_canvas.save(os.path.join(assets_dir, "android-icon-monochrome.png"), "PNG")
    
    print("\nSuccess! All FitFinity assets generated perfectly:")
    print(" - assets/icon.png: 1024x1024 (Opaque)")
    print(" - assets/favicon.png: 48x48 (Transparent)")
    print(" - assets/splash-icon.png: 1024x1024 (Transparent, Centered 412px)")
    print(" - assets/android-icon-foreground.png: 1024x1024 (Transparent, Centered 640px)")
    print(" - assets/android-icon-background.png: 1024x1024 (Solid #E6F4FE)")
    print(" - assets/android-icon-monochrome.png: 1024x1024 (Monochrome, Slate #303030)")

if __name__ == "__main__":
    generate_assets()
