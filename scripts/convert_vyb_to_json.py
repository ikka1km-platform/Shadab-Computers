import sqlite3
import json
import os
import re

def clean_phone(phone_raw):
    if not phone_raw:
        return ""
    # remove non-digit characters
    digits = re.sub(r'\D', '', str(phone_raw))
    # if it starts with 91 and has 12 digits, strip 91
    if len(digits) == 12 and digits.startswith('91'):
        return digits[2:]
    # if it has 10 digits
    if len(digits) == 10:
        return digits
    return digits[-10:] if len(digits) > 10 else digits

def convert():
    db_path = r'C:\Users\Lenovo\.gemini\antigravity\scratch\vyb_extract\ShadabComputers.vyp'
    desktop_dir = r'C:\Users\Lenovo\OneDrive\Desktop'
    output_json_path = os.path.join(desktop_dir, 'Vyapar_Backup_ShadabComputers_Converted.json')

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Read Parties (kb_names)
    cursor.execute("SELECT * FROM kb_names ORDER BY name_id ASC")
    raw_names = cursor.fetchall()
    parties = []
    party_name_map = {}

    for row in raw_names:
        name_id = row['name_id']
        raw_full_name = (row['full_name'] or '').strip()
        if not raw_full_name:
            continue

        # Replace Amjhera with Amzera (preserving case if uppercase)
        full_name = re.sub(r'AMJHERA', 'AMZERA', raw_full_name)
        full_name = re.sub(r'Amjhera', 'Amzera', full_name, flags=re.IGNORECASE)

        party_name_map[name_id] = full_name
        phone = clean_phone(row['phone_number'])
        raw_address = (row['address'] or '').strip()
        address = re.sub(r'AMJHERA', 'AMZERA', raw_address)
        address = re.sub(r'Amjhera', 'Amzera', address, flags=re.IGNORECASE)
        gstin = (row['name_gstin_number'] or row['name_tin_number'] or '').strip()
        email = (row['email'] or '').strip()
        
        # Determine if customer or supplier/expense
        # name_type: 1 = Customer, 2 = Expense/Supplier
        party_type = 'CUSTOMER' if row['name_type'] == 1 else 'SUPPLIER'
        
        # Check if Amzera route
        is_amzera = bool(re.search(r'AMZERA|AMZREA|AMJHERA', raw_full_name, re.IGNORECASE))
        firm_id = 8 if is_amzera else 7
        firm_name = 'Krishi sewa kendra' if is_amzera else 'Shadab Computers'

        curr_bal = float(row['amount'] or 0.0)

        parties.append({
            "id": name_id,
            "name": full_name,
            "accountCode": f"ACC-{name_id:04d}",
            "phone": phone,
            "email": email,
            "address": address,
            "gstin": gstin,
            "partyType": party_type,
            "openingBalance": 0.0,
            "currentBalance": curr_bal,
            "firmId": firm_id,
            "firmName": firm_name,
            "reminderRule": {
                "frequency": "DAILY",
                "daysOfWeek": [1, 2, 3, 4, 5, 6],
                "minAmount": 500
            },
            "createdAt": row['date_created'] or "2026-07-25T10:00:00.000Z",
            "updatedAt": row['date_modified'] or "2026-10-03T10:00:00.000Z"
        })

    # 2. Read Items (kb_items)
    cursor.execute("SELECT * FROM kb_items ORDER BY item_id ASC")
    raw_items = cursor.fetchall()
    items = []
    for row in raw_items:
        items.append({
            "id": row['item_id'],
            "name": (row['item_name'] or '').strip(),
            "code": row['item_code'] or f"ITEM-{row['item_id']}",
            "salePrice": float(row['item_sale_unit_price'] or 0.0),
            "purchasePrice": float(row['item_purchase_unit_price'] or 0.0),
            "stockQuantity": float(row['item_stock_quantity'] or 0.0),
            "minStockAlert": float(row['item_min_stock_quantity'] or 0.0),
            "unit": "PCS",
            "createdAt": row['item_date_created'] or "2026-07-25T10:00:00.000Z"
        })

    # 3. Read Transactions (kb_transactions)
    cursor.execute("SELECT * FROM kb_transactions ORDER BY txn_id ASC")
    raw_txns = cursor.fetchall()
    transactions = []

    for row in raw_txns:
        txn_id = row['txn_id']
        txn_type_raw = row['txn_type'] # 1 = Sale, 3 = Payment In
        name_id = row['txn_name_id']
        party_name = party_name_map.get(name_id, f"Customer #{name_id}")
        
        is_amzera = bool(re.search(r'AMZERA|AMZREA', party_name, re.IGNORECASE))
        firm_id = 8 if is_amzera else 7
        firm_name = 'Krishi sewa kendra' if is_amzera else 'Shadab Computers'

        date_str = str(row['txn_date'])[:10] if row['txn_date'] else "2026-10-02"
        cash_amt = float(row['txn_cash_amount'] or 0.0)
        bal_amt = float(row['txn_balance_amount'] or 0.0)
        ref_no = row['txn_ref_number_char'] or str(txn_id)

        if txn_type_raw == 1:
            # SALE
            ttype = 'SALE'
            total_amt = cash_amt + bal_amt
            paid_amt = cash_amt
            bal_due = bal_amt
            voucher = f"SL-{ref_no}"
            if bal_due <= 0:
                pstatus = 'PAID'
            elif paid_amt > 0:
                pstatus = 'PARTIAL'
            else:
                pstatus = 'UNPAID'
        elif txn_type_raw == 3:
            # PAYMENT_IN
            ttype = 'PAYMENT_IN'
            total_amt = cash_amt
            paid_amt = cash_amt
            bal_due = 0.0
            voucher = f"PY-{ref_no}"
            pstatus = 'PAID'
        else:
            ttype = 'SALE'
            total_amt = cash_amt + bal_amt
            paid_amt = cash_amt
            bal_due = bal_amt
            voucher = f"TX-{ref_no}"
            pstatus = 'UNPAID'

        transactions.append({
            "id": txn_id,
            "voucherNumber": voucher,
            "type": ttype,
            "partyId": name_id,
            "partyName": party_name,
            "date": date_str,
            "amount": total_amt,
            "paidAmount": paid_amt,
            "balanceDue": bal_due,
            "paymentStatus": pstatus,
            "paymentMode": "CASH",
            "description": row['txn_description'] or "",
            "firmId": firm_id,
            "firmName": firm_name,
            "createdAt": row['txn_date_created'] or f"{date_str}T10:00:00.000Z"
        })

    # 4. Standard Firms for Shadab Computers
    firms = [
        {
            "id": 7,
            "name": "Shadab Computers",
            "code": "MAIN",
            "isDefault": True,
            "phone": "9303965160",
            "address": "Rajgarh Dhar",
            "gstin": "",
            "firmId": "FIRM_MUI8HFY6_47UPAJ",
            "createdAt": "2026-09-26T10:15:22.114Z"
        },
        {
            "id": 8,
            "name": "Krishi sewa kendra",
            "code": "Ksk",
            "phone": "9303965160",
            "isDefault": False,
            "createdAt": "2026-09-27T07:41:35.514Z"
        }
    ]

    # 5. Bank Accounts
    bank_accounts = [
        {
            "id": 7,
            "accountName": "Cash in Hand",
            "bankName": "Cash Account",
            "accountNumber": "CASH-01",
            "openingBalance": 0.0,
            "currentBalance": 0.0,
            "firmId": 7,
            "firmName": "Shadab Computers",
            "createdAt": "2026-09-26T10:15:22.115Z"
        },
        {
            "id": 8,
            "accountName": "Krishi sewa kendra",
            "bankName": "Icici",
            "accountNumber": "406205001843",
            "ifscCode": "ICIC0004062",
            "upiId": "Krishisewa86@icici",
            "openingBalance": 0.0,
            "currentBalance": 0.0,
            "firmId": 8,
            "firmName": "Krishi sewa kendra",
            "createdAt": "2026-09-27T07:43:09.602Z"
        },
        {
            "id": 9,
            "accountName": "Shadab Computers",
            "bankName": "Icicic",
            "accountNumber": "406205001812",
            "ifscCode": "ICIC0004062",
            "openingBalance": 0.0,
            "currentBalance": 0.0,
            "firmId": 7,
            "firmName": "Shadab Computers",
            "createdAt": "2026-09-27T07:45:43.253Z"
        }
    ]

    # 6. Business Profile
    business_profile = [
        {
            "id": 1,
            "businessName": "Shadab Computers",
            "ownerName": "Shadab",
            "phone": "9303965160",
            "address": "Rajgarh Dhar, Madhya Pradesh",
            "firmId": "FIRM_MUI8HFY6_47UPAJ",
            "securityPin": "1234",
            "isDailyAutoBackupEnabled": True,
            "createdAt": "2026-09-26T10:15:22.114Z"
        }
    ]

    # Assemble Final Backup Payload
    backup_payload = {
        "appName": "Vyapar Business App",
        "version": 3,
        "backupDate": "2026-10-03T10:48:56.000Z",
        "sourceFile": "ShadabComputersvyp_03-10-2026_10.48.56.vyb",
        "parties": parties,
        "transactions": transactions,
        "items": items,
        "firms": firms,
        "bankAccounts": bank_accounts,
        "businessProfile": business_profile,
        "coWorkers": []
    }

    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(backup_payload, f, indent=2, ensure_ascii=False)

    # 7. Also update Cloud Vault for Shadab Computers (FIRM_MUI8HFY6_47UPAJ)
    vault_path = r'C:\VYApaar with cash counter\cloud-data\firms\FIRM_MUI8HFY6_47UPAJ\vault.json'
    if os.path.exists(vault_path):
        try:
            with open(vault_path, 'r', encoding='utf-8') as f:
                vault_data = json.load(f)
            
            vault_data['parties'] = parties
            vault_data['transactions'] = transactions
            vault_data['items'] = items
            vault_data['firms'] = firms
            vault_data['bankAccounts'] = bank_accounts
            vault_data['syncVersion'] = vault_data.get('syncVersion', 1) + 1
            vault_data['lastUpdatedAt'] = "2026-10-03T11:23:00.000Z"
            
            with open(vault_path, 'w', encoding='utf-8') as f:
                json.dump(vault_data, f, indent=2, ensure_ascii=False)
            print(f"• Cloud Vault updated at: {vault_path}")
        except Exception as e:
            print(f"Could not update vault.json: {e}")

    print("=== CONVERSION SUCCESSFUL ===")
    print(f"File saved to: {output_json_path}")
    print(f"File size: {os.path.getsize(output_json_path) / 1024 / 1024:.2f} MB")
    print(f"• Parties converted (Amzera): {len(parties)}")
    print(f"• Transactions converted (Amzera): {len(transactions)}")
    print(f"• Items converted: {len(items)}")
    print(f"• Firms: {len(firms)}")
    print(f"• Bank Accounts: {len(bank_accounts)}")

if __name__ == '__main__':
    convert()
