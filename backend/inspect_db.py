import sqlite3

c = sqlite3.connect('graph3.db')
tables = [
    'business_partners',
    'sales_order_headers',
    'outbound_delivery_headers',
    'billing_document_headers',
    'payments_accounts_receivable'
]
for t in tables:
    n = c.execute(f'SELECT COUNT(*) FROM [{t}]').fetchone()[0]
    cols = [r[1] for r in c.execute(f'PRAGMA table_info([{t}])')]
    print(f'{t}: {n} rows')
    print(f'  cols: {cols}')
    print()
