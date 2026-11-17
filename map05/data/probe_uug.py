"""Read the public example from GUGiK documentation, never user addresses."""
import json
from pathlib import Path
import urllib.parse
import urllib.request

url = 'https://services.gugik.gov.pl/uug/?' + urllib.parse.urlencode({
    'request': 'GetAddress', 'address': 'Marki, Andersa 1', 'exact_number': '1', 'srid': '4326',
})
request = urllib.request.Request(url, headers={'User-Agent': 'MMS-Planowanie-Local-QA/1.0'})
with urllib.request.urlopen(request, timeout=20) as response:
    data = json.load(response)
    print('HTTP', response.status)
output = Path(__file__).resolve().parent / 'uug-public-example.json'
output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(data, ensure_ascii=False)[:6000])
