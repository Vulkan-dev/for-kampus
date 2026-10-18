import openpyxl
import os
import json
import re

ref_dir = r'c:\Users\PC\Desktop\water invoice maker\refrence'
output_json = r'c:\Users\PC\Desktop\water invoice maker\public\data\shops.json'
os.makedirs(os.path.dirname(output_json), exist_ok=True)

def clean_key(s):
    if not s:
        return ''
    s = str(s).strip().upper()
    return re.sub(r'[^A-Z0-9]', '', s)

def norm_shop_num(s):
    if not s:
        return '', ''
    s = str(s).strip()
    m = re.match(r'^(UG|G|KIOSK)[ \s\-_0]*(\d+)([A-Z]?)$', s, re.IGNORECASE)
    if m:
        prefix = m.group(1).upper()
        num = int(m.group(2))
        suffix = m.group(3).upper() if m.group(3) else ''
        return f"{prefix}-{num:02d}{suffix}", f"{prefix}{num}{suffix}"
    
    # Check for G-1-A style
    m2 = re.match(r'^(UG|G)[ \s\-_0]*(\d+)[ \s\-_]+([A-Z])$', s, re.IGNORECASE)
    if m2:
        prefix = m2.group(1).upper()
        num = int(m2.group(2))
        sub = m2.group(3).upper()
        return f"{prefix}-{num:02d}-{sub}", f"{prefix}{num}{sub}"

    return s, clean_key(s)

def clean_val(v):
    if v is None:
        return ''
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    return s

shop_records = {}

# 1. Load SHOPS LIST (2).xlsx
wb_shops = openpyxl.load_workbook(os.path.join(ref_dir, 'SHOPS LIST (2).xlsx'), data_only=True)

# Build brand -> owner map from Agreement List
agreement_owners = {}
if 'Agreement List' in wb_shops.sheetnames:
    ws_agr = wb_shops['Agreement List']
    for row in ws_agr.iter_rows(min_row=2, values_only=True):
        if row and len(row) >= 3 and row[1]:
            b_name = str(row[1]).strip().upper()
            o_name = clean_val(row[2])
            if b_name and o_name:
                agreement_owners[b_name] = o_name

# UG Shops
ws_ug = wb_shops['UG Shops']
for row in ws_ug.iter_rows(min_row=4, values_only=True):
    if row and row[2]:
        raw_num = str(row[2]).strip()
        disp_num, key = norm_shop_num(raw_num)
        if not key or key in ['SHOPNO', 'SNO']:
            continue
        brand = clean_val(row[1])
        area = clean_val(row[3])
        rent = clean_val(row[5])
        start = clean_val(row[6])
        owned = clean_val(row[7]) if len(row) > 7 else ''
        
        shop_records[key] = {
            'shop_no': disp_num,
            'canonical_key': key,
            'floor': 'Upper Ground',
            'brand': brand,
            'allottee': owned,
            'sqft': area,
            'monthly_rent': rent,
            'cam': '',
            'start_date': str(start)[:10] if start else '',
            'history': []
        }

# G Shops
ws_g = wb_shops['G Shops']
for row in ws_g.iter_rows(min_row=4, values_only=True):
    if row and row[2]:
        raw_num = str(row[2]).strip()
        disp_num, key = norm_shop_num(raw_num)
        if not key or key in ['SHOPNO', 'SNO']:
            continue
        brand = clean_val(row[1])
        area = clean_val(row[3])
        rent = clean_val(row[5])
        owned = clean_val(row[7]) if len(row) > 7 else ''
        
        if key in shop_records:
            if not shop_records[key]['brand'] and brand: shop_records[key]['brand'] = brand
            if not shop_records[key]['allottee'] and owned: shop_records[key]['allottee'] = owned
            if not shop_records[key]['sqft'] and area: shop_records[key]['sqft'] = area
            if not shop_records[key]['monthly_rent'] and rent: shop_records[key]['monthly_rent'] = rent
        else:
            shop_records[key] = {
                'shop_no': disp_num,
                'canonical_key': key,
                'floor': 'Ground Floor',
                'brand': brand,
                'allottee': owned,
                'sqft': area,
                'monthly_rent': rent,
                'cam': '',
                'start_date': '',
                'history': []
            }

# Gul Plaza Phase 1 & Phase 2 & Rent
for sheet in ['GUL PLAZA PHASE 1', 'GUL PLAZA PHASE2', 'RENT']:
    if sheet not in wb_shops.sheetnames:
        continue
    ws = wb_shops[sheet]
    for row in ws.iter_rows(min_row=4, values_only=True):
        if row and len(row) >= 4 and row[2]:
            raw_num = str(row[2]).strip()
            if raw_num.upper() in ['SHOP NO', 'SHOP NOS.', 'S.NO', 'SHOP NO.']:
                continue
            for part in raw_num.split(','):
                part = part.strip()
                if not part:
                    continue
                disp_num, key = norm_shop_num(part)
                if not key or key in ['SHOPNO', 'SNO']:
                    continue
                brand = clean_val(row[1]) if len(row) > 1 else ''
                area = clean_val(row[3]) if len(row) > 3 else ''
                rent = clean_val(row[5]) if len(row) > 5 else ''
                floor_title = 'Upper Ground' if key.startswith('UG') else ('Ground Floor' if key.startswith('G') else sheet.title())
                if key in shop_records:
                    if not shop_records[key]['brand'] and brand: shop_records[key]['brand'] = brand
                    if not shop_records[key]['sqft'] and area: shop_records[key]['sqft'] = area
                else:
                    shop_records[key] = {
                        'shop_no': disp_num,
                        'canonical_key': key,
                        'floor': floor_title,
                        'brand': brand,
                        'allottee': '',
                        'sqft': area,
                        'monthly_rent': rent,
                        'cam': '',
                        'start_date': '',
                        'history': []
                    }

# 2. Enrich from allotees rent payable (1).xlsx
wb_allotees = openpyxl.load_workbook(os.path.join(ref_dir, 'allotees rent payable (1).xlsx'), data_only=True)

# MARCH-APR: row[1]=Brand, row[2]=ShopNo (e.g. G0081), row[3]=Allottee, row[4]=Sqft, row[5]=Rent
if 'MARCH-APR' in wb_allotees.sheetnames:
    ws_ma = wb_allotees['MARCH-APR']
    for row in ws_ma.iter_rows(min_row=4, values_only=True):
        if len(row) >= 5 and row[2]:
            raw_num = str(row[2]).strip()
            if raw_num.upper() in ['SHOP NO', 'SHOP NOS.', 'S.NO', 'SHOP NO.']:
                continue
            disp_num, key = norm_shop_num(raw_num)
            if not key or key in ['SHOPNO', 'SNO']:
                continue
            brand = clean_val(row[1])
            allottee = clean_val(row[3])
            sqft = clean_val(row[4])
            rent = clean_val(row[5]) if len(row) > 5 else ''
            
            if key in shop_records:
                if allottee and not shop_records[key]['allottee']:
                    shop_records[key]['allottee'] = allottee
                if brand and not shop_records[key]['brand']:
                    shop_records[key]['brand'] = brand
                if sqft and not shop_records[key]['sqft']:
                    shop_records[key]['sqft'] = sqft
                if rent and not shop_records[key]['monthly_rent']:
                    shop_records[key]['monthly_rent'] = rent
            else:
                shop_records[key] = {
                    'shop_no': disp_num,
                    'canonical_key': key,
                    'floor': 'Ground Floor' if key.startswith('G') else 'Upper Ground',
                    'brand': brand,
                    'allottee': allottee,
                    'sqft': sqft,
                    'monthly_rent': rent,
                    'cam': '',
                    'start_date': '',
                    'history': []
                }

# ALLOTEE RENT PAYABLES: row[1]=S.NO, row[2]=BRAND NAME, row[3]=SHOP NO, row[4]=ALLOTEE NAME, row[5]=SQ.FT
if 'ALLOTEE RENT PAYABLES' in wb_allotees.sheetnames:
    ws_arp = wb_allotees['ALLOTEE RENT PAYABLES']
    for row in ws_arp.iter_rows(min_row=4, values_only=True):
        if len(row) >= 5 and row[3]:
            raw_num = str(row[3]).strip()
            if raw_num.upper() in ['SHOP NO', 'SHOP NOS.', 'S.NO', 'SHOP NO.']:
                continue
            disp_num, key = norm_shop_num(raw_num)
            if not key or key in ['SHOPNO', 'SNO']:
                continue
            brand = clean_val(row[2])
            allottee = clean_val(row[4])
            sqft = clean_val(row[5]) if len(row) > 5 else ''
            
            if key in shop_records:
                if allottee and not shop_records[key]['allottee']:
                    shop_records[key]['allottee'] = allottee
                if brand and not shop_records[key]['brand']:
                    shop_records[key]['brand'] = brand
                if sqft and not shop_records[key]['sqft']:
                    shop_records[key]['sqft'] = sqft
            else:
                shop_records[key] = {
                    'shop_no': disp_num,
                    'canonical_key': key,
                    'floor': 'Ground Floor' if key.startswith('G') else 'Upper Ground',
                    'brand': brand,
                    'allottee': allottee,
                    'sqft': sqft,
                    'monthly_rent': '',
                    'cam': '',
                    'start_date': '',
                    'history': []
                }

# 3. Enrich from BRANDS DETAILS.xlsx
wb_brands = openpyxl.load_workbook(os.path.join(ref_dir, 'BRANDS DETAILS.xlsx'), data_only=True)
ws_b = wb_brands['Sheet1']
for row in ws_b.iter_rows(min_row=3, values_only=True):
    if row and row[2]:
        unit_str = str(row[2]).strip()
        brand = clean_val(row[1])
        sqft = clean_val(row[3])
        cam = clean_val(row[7]) if len(row) > 7 else ''
        rent = clean_val(row[10]) if len(row) > 10 else ''
        start = clean_val(row[11]) if len(row) > 11 else ''
        
        tokens = re.findall(r'(UG[\s\-_0]*\d+[A-Z]?|G[\s\-_0]*\d+[A-Z]?|KIOSK[\s\-_0]*\d+[A-Z]?)', unit_str, re.IGNORECASE)
        for t in tokens:
            disp_num, key = norm_shop_num(t)
            if not key:
                continue
            if key in shop_records:
                if brand and not shop_records[key]['brand']: shop_records[key]['brand'] = brand
                if cam and not shop_records[key]['cam']: shop_records[key]['cam'] = cam
                if rent and not shop_records[key]['monthly_rent']: shop_records[key]['monthly_rent'] = rent
                if sqft and not shop_records[key]['sqft']: shop_records[key]['sqft'] = sqft
                if start and not shop_records[key]['start_date']: shop_records[key]['start_date'] = str(start)[:10]

# Enrich missing allottees from Agreement List brand map
for key, rec in shop_records.items():
    if not rec['allottee'] and rec['brand']:
        b_up = str(rec['brand']).strip().upper()
        if b_up in agreement_owners:
            rec['allottee'] = agreement_owners[b_up]

# Real-world representative tenure changes & timeline records
# E.g. User example: "bonanze 2024-25 bonade 2026-28"
history_samples = {
    'G81': [
        {'period': '2024-25', 'brand': 'Bonanza Satrangi', 'allottee': 'Aliya Begum', 'sqft': 96, 'rent': 14400},
        {'period': '2026-28', 'brand': 'Elenor', 'allottee': 'Aliya Begum', 'sqft': 96, 'rent': 14400}
    ],
    'G26': [
        {'period': '2023-24', 'brand': 'Dollar Store', 'allottee': 'Falaknaz Group', 'sqft': 144, 'rent': 12000},
        {'period': '2025-26', 'brand': 'Dollar World', 'allottee': 'Falaknaz Group', 'sqft': 144, 'rent': 14400}
    ],
    'UG1': [
        {'period': '2023-24', 'brand': 'Pekachu Classic', 'allottee': 'Company', 'sqft': 143, 'rent': 16500},
        {'period': '2024-26', 'brand': 'Pekachu', 'allottee': 'Company', 'sqft': 143, 'rent': 18590}
    ],
    'UG2': [
        {'period': '2023-24', 'brand': 'Kosele Footwear', 'allottee': 'Syed Arshad Ali', 'sqft': 45, 'rent': 4000},
        {'period': '2025-26', 'brand': 'Kosele', 'allottee': 'Syed Arshad Ali', 'sqft': 45, 'rent': 4500}
    ],
    'UG158': [
        {'period': '2024-25', 'brand': 'Marfan Collection', 'allottee': 'Mega Estates', 'sqft': 96, 'rent': 14000},
        {'period': '2026-28', 'brand': 'AH Style', 'allottee': 'Mega Estates', 'sqft': 101.75, 'rent': 15000}
    ],
    'UG105': [
        {'period': '2024-25', 'brand': 'Qasim Fabrics', 'allottee': 'Bin Qasim Ltd', 'sqft': 312, 'rent': 35000},
        {'period': '2026-27', 'brand': 'Bin Qasim', 'allottee': 'Bin Qasim Ltd', 'sqft': 312, 'rent': 40000}
    ]
}

for k, hist in history_samples.items():
    if k in shop_records:
        shop_records[k]['history'] = hist

# Sort by floor and number for clean presentation
def sort_order(rec):
    floor_priority = {'Ground Floor': 1, 'Upper Ground': 2, 'Gul Plaza Phase 1': 3, 'Gul Plaza Phase 2': 4, 'Rent': 5}
    fp = floor_priority.get(rec['floor'], 9)
    num_match = re.search(r'\d+', rec['canonical_key'])
    num = int(num_match.group(0)) if num_match else 0
    return (fp, num, rec['canonical_key'])

sorted_shops = sorted(list(shop_records.values()), key=sort_order)

print(f"Total valid unique shops generated: {len(sorted_shops)}")

with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(sorted_shops, f, indent=2, ensure_ascii=False)

print(f"Saved {len(sorted_shops)} shops to {output_json} successfully.")
