import csv
import io
from typing import Any


def generate_csv_report(headers: list[str], rows: list[list[Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    content = output.getvalue()
    output.close()
    return content
