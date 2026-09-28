import zlib
import struct
import math

def create_png(filename, size, bg_color=(37, 99, 235), text_color=(255, 255, 255)):
    width, height = size, size
    raw_data = bytearray()
    
    center = size / 2.0
    radius = size * 0.44
    corner_radius = size * 0.22
    
    for y in range(height):
        raw_data.append(0)  # Filter type 0 (None)
        for x in range(width):
            # Check rounded rectangle
            dx = max(0, abs(x - center) - (center - corner_radius))
            dy = max(0, abs(y - center) - (center - corner_radius))
            dist = math.sqrt(dx * dx + dy * dy)
            
            if dist > corner_radius:
                # Transparent outside
                raw_data.extend([0, 0, 0, 0])
            else:
                # Gradient background from deep blue to indigo
                factor = (x + y) / (width + height)
                r = int(26 + (59 - 26) * (1 - factor))
                g = int(86 + (130 - 86) * (1 - factor))
                b = int(219 + (246 - 219) * (1 - factor))
                
                # Draw a simple bold "V" glyph in center
                nx = (x - center) / (size * 0.3)
                ny = (y - center) / (size * 0.3)
                
                # Check if inside "V" shape
                in_v = False
                if -0.8 <= ny <= 0.8:
                    # Left wing of V: line from (-0.7, -0.7) to (0, 0.7)
                    # Right wing of V: line from (0.7, -0.7) to (0, 0.7)
                    if ny >= -0.7 and ny <= 0.7:
                        target_x = (ny - 0.7) * (-0.7 / 1.4)  # right wing
                        target_x_left = (ny - 0.7) * (0.7 / 1.4)  # left wing
                        if abs(nx - target_x) < 0.22 or abs(nx - target_x_left) < 0.22:
                            in_v = True
                
                # Inner rupee horizontal bar
                if -0.15 <= ny <= -0.02 and -0.45 <= nx <= 0.45:
                    in_v = True
                if 0.15 <= ny <= 0.28 and -0.35 <= nx <= 0.35:
                    in_v = True
                
                if in_v:
                    raw_data.extend([255, 255, 255, 255])
                else:
                    raw_data.extend([r, g, b, 255])

    # Construct PNG chunks
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    idat_data = zlib.compress(bytes(raw_data))
    
    png_bytes = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr_data) + chunk(b'IDAT', idat_data) + chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(png_bytes)
    print(f"Generated {filename} ({size}x{size})")

create_png("public/icon-192.png", 192)
create_png("public/icon-512.png", 512)
create_png("public/icon-maskable-192.png", 192)
create_png("public/icon-maskable-512.png", 512)
