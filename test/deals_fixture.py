"""A deals.json like the GitHub job makes, dated around today, for the browser tests.
One special carries HTML and a javascript: link, to prove text from the file is never run."""
from datetime import date, datetime, timedelta, timezone

URL = 'https://deals.test/deals.json'


def week(t):
    start = t - timedelta(days=(t.weekday() - 2) % 7)  # back to Wednesday
    return start, start + timedelta(days=6)


def second_saturday(y, m):
    d = date(y, m, 1)
    while d.weekday() != 5:
        d += timedelta(days=1)
    return d + timedelta(days=7)


def next_second_saturday(t):
    d = second_saturday(t.year, t.month)
    if d >= t:
        return d
    return second_saturday(t.year + (t.month == 12), t.month % 12 + 1)


def feed(today_iso):
    t = date.fromisoformat(today_iso)
    s, e = week(t)
    S, E = s.isoformat(), e.isoformat()
    specials = [
        {'s': 'Coles', 'n': 'Sanitarium Weet-Bix 575g', 'was': 500, 'now': 250, 'off': 50, 'cat': 'Pantry', 'last': '11 weeks ago @ WW', 'link': 'https://www.coles.com.au/product/weet-bix-123', 'src': 'hp'},
        {'s': 'Woolworths', 'n': 'Vittoria Espresso Coffee Beans 1kg', 'was': 4000, 'now': 2000, 'off': 50, 'cat': 'Pantry', 'last': 'Never', 'link': '', 'src': 'hp'},
        {'s': 'Coles', 'n': 'Tip Top English Muffins 6 Pack 400g', 'was': 640, 'now': 320, 'off': 50, 'cat': 'Bakery', 'last': '1 week ago @ WW', 'link': '', 'src': 'hp'},
        {'s': 'Woolworths', 'n': '<img src=x onerror="window.__xss=1"> Helga\'s Wraps', 'was': 550, 'now': 275, 'off': 50, 'cat': 'Bakery', 'last': '7 weeks ago @ WW', 'link': 'javascript:window.__xss=1', 'src': 'hp'},
        {'s': 'Harris Farm', 'n': 'Imperfect Avocados 600g', 'was': 450, 'now': 299, 'off': 34, 'cat': 'Fruit', 'last': '', 'link': 'https://www.harrisfarm.com.au/products/imperfect-avocados', 'src': 'hf'},
        {'s': 'Harris Farm', 'n': 'Harris Farm Pure Australian Honey 1kg', 'was': 1299, 'now': 899, 'off': 31, 'cat': 'Pantry', 'last': '', 'link': 'https://www.harrisfarm.com.au/products/hf-honey', 'src': 'hf'},
    ]
    for i in range(14):
        specials.append({'s': 'Coles' if i % 2 else 'Woolworths', 'n': f'Pantry item {i + 1} 500g', 'was': 400 + i * 10, 'now': 200 + i * 5, 'off': 50,
                         'cat': 'Pantry', 'last': f'{i + 2} weeks ago @ CL', 'link': '', 'src': 'hp'})
    deals = [
        {'id': '979001', 't': "Tony's Chocolonely Chocolate Varieties 180g $7.95 (Was $9.95)", 's': 'Coles', 'link': 'https://www.ozbargain.com.au/node/979001', 'from': S, 'to': E, 'votes': 44},
        {'id': '979005', 't': 'Iceberg Lettuce $1.50, Coriander $0.99', 's': 'Harris Farm', 'link': 'https://www.ozbargain.com.au/node/979005', 'from': S, 'to': (t + timedelta(days=2)).isoformat(), 'votes': 30},
        {'id': '979010', 't': 'Sushi Rice 5kg $12', 's': 'Some Japanese Grocer', 'link': 'https://www.ozbargain.com.au/node/979010', 'from': S, 'to': E, 'votes': 12},
        {'id': '980001', 't': '½ Price: Sanitarium Weet-Bix 575g $2.50 @ Coles + 191 More', 's': 'Coles + 191 More', 'link': 'https://www.ozbargain.com.au/node/980001', 'from': S, 'to': E, 'votes': 118, 'hp': True},
        {'id': '970000', 't': 'Ended last week', 's': 'Coles', 'link': 'https://www.ozbargain.com.au/node/970000', 'from': (s - timedelta(days=7)).isoformat(), 'to': (t - timedelta(days=1)).isoformat(), 'votes': 99},
    ]
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    return {'v': 1, 'updated': now, 'today': today_iso,
            'sources': {'ozb': {'ok': True, 'feeds': 4, 'n': len(deals), 'at': now},
                        'report': {'ok': True, 'id': '980001', 'link': 'https://www.ozbargain.com.au/node/980001', 'date': S, 'from': S, 'to': E, 'n': 18, 'coles': 9, 'woolies': 9, 'at': now},
                        'harris': {'ok': True, 'handle': 'specials', 'from': S, 'to': E, 'n': 2, 'at': now}},
            'specials': specials, 'deals': deals}
