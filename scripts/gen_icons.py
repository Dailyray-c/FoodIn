from PIL import Image, ImageDraw
import math

def draw_basket(draw, cx, cy, s):
    """Draw a clean white shopping basket centered at (cx, cy). s = overall scale."""
    # Basket body: trapezoid (wider top, narrower bottom)
    top_w = s * 0.64
    bot_w = s * 0.48
    body_h = s * 0.36
    body_top = cy - s * 0.04
    body_bot = body_top + body_h
    body = [
        (cx - top_w/2, body_top),
        (cx + top_w/2, body_top),
        (cx + bot_w/2, body_bot),
        (cx - bot_w/2, body_bot),
    ]
    draw.polygon(body, fill='white')

    # Slats: 3 orange vertical stripes inside the basket
    slat_w = s * 0.06
    for offset in (-0.20, 0.0, 0.20):
        x = cx + offset * s
        top_y = body_top + s * 0.025
        bot_y = body_bot - s * 0.025
        draw.rectangle([x - slat_w/2, top_y, x + slat_w/2, bot_y], fill='#f97316')

    # Handle: thick rounded arc above the basket
    handle_r = s * 0.22
    handle_cy = body_top - s * 0.04
    lw = max(6, int(s * 0.07))
    # Draw as two thick rounded caps + arc for clear handle look
    draw.arc([cx - handle_r, handle_cy - handle_r, cx + handle_r, handle_cy + handle_r],
             start=200, end=340, fill='white', width=lw)

def make_icon(size):
    img = Image.new('RGB', (size, size), '#f97316')
    draw = ImageDraw.Draw(img)
    draw_basket(draw, size/2, size/2 + size*0.05, size * 0.58)
    return img

icon512 = make_icon(512)
icon512.save(r'C:\Users\Administrator\WorkBuddy\2026-08-08-19-09-36\icon-512.png')
icon192 = make_icon(192)
icon192.save(r'C:\Users\Administrator\WorkBuddy\2026-08-08-19-09-36\icon-192.png')
print('Icons generated: icon-512.png, icon-192.png')
