from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
assets = root / 'assets'
assets.mkdir(exist_ok=True)

W, H = 1024, 1024
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Background is transparent so the icon can be used cleanly on Windows.
# Create the desktop computer monitor.
monitor_x1, monitor_y1 = 120, 220
monitor_x2, monitor_y2 = 904, 670
screen_x1, screen_y1 = 160, 250
screen_x2, screen_y2 = 864, 590

# Monitor body
body_color = (60, 140, 180)
draw.rounded_rectangle((monitor_x1, monitor_y1, monitor_x2, monitor_y2), radius=32, fill=body_color, outline=(0, 0, 0), width=18)
# Screen area
screen_color = (144, 216, 236)
draw.rounded_rectangle((screen_x1, screen_y1, screen_x2, screen_y2), radius=24, fill=screen_color, outline=(0, 0, 0), width=14)

# Top panel / menu icon and side card
left_box = (180, 300, 420, 460)
right_box = (600, 300, 850, 460)
draw.rounded_rectangle(left_box, radius=20, fill=(46, 170, 210), outline=(0, 0, 0), width=12)
draw.rounded_rectangle(right_box, radius=20, fill=(46, 170, 210), outline=(0, 0, 0), width=12)
# Bars inside left panel
for bar_y in (340, 390, 440):
    draw.rounded_rectangle((220, bar_y, 376, bar_y + 22), radius=8, fill=(250, 250, 250), outline=(0, 0, 0), width=2)
# small connection line from box to screen
for x in (425, 470, 515):
    draw.line((x, 380, x + 26, 380), fill=(0, 0, 0), width=10)

# Light bulb on top right
bulb_x, bulb_y = 700, 120
bulb_r = 130
# bulb body
bulb_body = Image.new('RGBA', (W, H), (0, 0, 0, 0))
bulb_draw = ImageDraw.Draw(bulb_body)
bulb_draw.ellipse((bulb_x - bulb_r, bulb_y - bulb_r, bulb_x + bulb_r, bulb_y + bulb_r), fill=(255, 201, 80), outline=(0, 0, 0), width=14)
# base and filament
bulb_draw.rounded_rectangle((bulb_x - 54, bulb_y + 90, bulb_x + 54, bulb_y + 150), radius=14, fill=(255, 201, 80), outline=(0, 0, 0), width=10)
bulb_draw.line((bulb_x - 24, bulb_y + 12, bulb_x, bulb_y + 42), fill=(255, 255, 255), width=10)
bulb_draw.line((bulb_x + 24, bulb_y + 12, bulb_x, bulb_y + 42), fill=(255, 255, 255), width=10)
img = Image.alpha_composite(img, bulb_body)

# Gear in center of the monitor screen
center_x, center_y = 512, 420
gear_outer = 150
gear_inner = 72
gear_color = (240, 103, 57)
# outer disc
for ring in [gear_outer, gear_outer - 25]:
    draw.ellipse((center_x - ring, center_y - ring, center_x + ring, center_y + ring), fill=gear_color, outline=(0, 0, 0), width=10)
# center hole
draw.ellipse((center_x - gear_inner, center_y - gear_inner, center_x + gear_inner, center_y + gear_inner), fill=(255, 255, 255), outline=(0, 0, 0), width=10)
# spokes
for angle in range(0, 360, 45):
    rad = angle * 3.141592653589793 / 180
    x1 = center_x + int(0.4 * gear_outer * __import__('math').cos(rad))
    y1 = center_y + int(0.4 * gear_outer * __import__('math').sin(rad))
    x2 = center_x + int(0.9 * gear_outer * __import__('math').cos(rad))
    y2 = center_y + int(0.9 * gear_outer * __import__('math').sin(rad))
    draw.line((x1, y1, x2, y2), fill=(240, 103, 57), width=24)

# Add cable from bulb to gear and monitor edge
cable_color = (0, 0, 0)
draw.line((545, 250, 600, 250), fill=cable_color, width=10)
draw.line((600, 250, 600, 315), fill=cable_color, width=10)
draw.line((600, 315, 700, 315), fill=cable_color, width=10)

draw.line((605, 330, 625, 520), fill=cable_color, width=10)
draw.line((625, 520, 618, 585), fill=cable_color, width=10)

# Stand/base for the computer
stand_top_y = 674
base_y = 770
# stand arm
stand_x1, stand_x2 = 420, 604
draw.rounded_rectangle((stand_x1, stand_top_y, stand_x2, stand_top_y + 32), radius=12, fill=(124, 180, 210), outline=(0, 0, 0), width=10)
# base
base_width = 600
base_left = 212
base_right = 812
draw.rounded_rectangle((base_left, base_y, base_right, base_y + 56), radius=18, fill=(190, 190, 190), outline=(0, 0, 0), width=10)

# Small bottom support strip
bottom_strip = (280, 714, 744, 756)
draw.rounded_rectangle(bottom_strip, radius=12, fill=(200, 200, 200), outline=(0, 0, 0), width=8)

# Save outputs
png_path = assets / 'icon.png'
img.save(png_path, format='PNG')
try:
    img.save(assets / 'icon.ico', format='ICO')
except Exception:
    pass

print(f'Created {png_path}')
