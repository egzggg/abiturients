"""Read-only, paginated SQLite adapter for the local dashboard."""
from __future__ import annotations

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3

FIELDS = ('id', 'llm_model', 'request', 'answer', 'llm_judge_model', 'manual_grade', 'llm_grade')


def answer_summary(connection: sqlite3.Connection) -> list[dict]:
    answered = "TRIM(COALESCE(answer, '')) != ''"
    metrics = [f"SUM(CASE WHEN {answered} THEN 1 ELSE 0 END) AS answered"]
    for field, prefix in [('manual_grade', 'manual'), ('llm_grade', 'llm')]:
        grade = f"TRIM(COALESCE({field}, ''))"
        for suffix, condition in [('correct', f"{grade} = '1'"), ('incorrect', f"{grade} = '0'"),
                                  ('missing', f"{grade} = ''"), ('unrecognized', f"{grade} NOT IN ('', '0', '1')")]:
            metrics.append(f"SUM(CASE WHEN {answered} AND {condition} THEN 1 ELSE 0 END) AS {prefix}_{suffix}")
    rows = connection.execute(
        "SELECT llm_model AS model, COUNT(*) AS total, " + ', '.join(metrics) +
        " FROM answers GROUP BY llm_model ORDER BY llm_model COLLATE NOCASE, llm_model"
    ).fetchall()
    summary = []
    for row in rows:
        item = {'model': row['model'], 'total': row['total'], 'answered': row['answered']}
        for prefix in ('manual', 'llm'):
            counts = {key: row[f'{prefix}_{key}'] for key in ('correct', 'incorrect', 'missing', 'unrecognized')}
            evaluated = counts['correct'] + counts['incorrect']
            item[prefix] = {**counts, 'evaluated': evaluated,
                            'accuracy': counts['correct'] / evaluated * 100 if evaluated else None}
        summary.append(item)
    return summary


def read_answers(db_path: Path, page: int = 1, page_size: int = 25, search: str = '', sort_by: str = 'id', order: str = 'desc', model: str = '', judge_model: str = '', manual_grade: str = 'all', llm_grade: str = 'all') -> dict:
    if page < 1 or not 1 <= page_size <= 100:
        raise ValueError('Invalid pagination')
    if sort_by not in ('id', 'llm_model', 'llm_judge_model') or order not in ('asc', 'desc'):
        raise ValueError('Invalid sorting')
    if manual_grade not in ('all', 'present', 'missing') or llm_grade not in ('all', 'present', 'missing'):
        raise ValueError('Invalid grade filter')
    if not db_path.is_file():
        return {'available': False, 'rows': [], 'total': 0, 'page': page, 'pageSize': page_size, 'models': [], 'judgeModels': [], 'summary': []}
    with closing(sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)) as connection:
        connection.row_factory = sqlite3.Row
        # Escape LIKE wildcards so search means literal text, not an SQL pattern.
        pattern = '%' + search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        conditions = ['(' + ' OR '.join(f'CAST({field} AS TEXT) LIKE ? ESCAPE \'\\\'' for field in FIELDS) + ')'] if search else []
        parameters = [pattern] * len(FIELDS) if search else []
        for field, value in [('llm_model', model), ('llm_judge_model', judge_model)]:
            if value:
                conditions.append(f'{field} = ?')
                parameters.append(value)
        for field, value in [('manual_grade', manual_grade), ('llm_grade', llm_grade)]:
            if value != 'all':
                comparison = "!= ''" if value == 'present' else "= ''"
                conditions.append(f"TRIM(COALESCE({field}, '')) {comparison}")
        where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        connection.execute('BEGIN')
        summary = answer_summary(connection)
        options = {}
        for field, key in [('llm_model', 'models'), ('llm_judge_model', 'judgeModels')]:
            options[key] = [row[0] for row in connection.execute(
                f"SELECT DISTINCT {field} FROM answers WHERE {field} IS NOT NULL AND TRIM({field}) != '' ORDER BY {field} COLLATE NOCASE, {field}"
            )]
        total = connection.execute('SELECT COUNT(*) FROM answers' + where, parameters).fetchone()[0]
        page = min(page, max(1, (total + page_size - 1) // page_size))
        # Sort the entire result before pagination; empty models stay at the end.
        ordering = f'id {order}' if sort_by == 'id' else (
            f"CASE WHEN {sort_by} IS NULL OR TRIM({sort_by}) = '' THEN 1 ELSE 0 END, "
            f"COALESCE(NULLIF(TRIM({sort_by}), ''), '') COLLATE NOCASE {order}, id DESC"
        )
        rows = connection.execute(
            'SELECT ' + ', '.join(FIELDS) + ' FROM answers' + where + ' ORDER BY ' + ordering + ' LIMIT ? OFFSET ?',
            [*parameters, page_size, (page - 1) * page_size],
        ).fetchall()
    return {'available': True, 'rows': [dict(row) for row in rows], 'total': total, 'page': page, 'pageSize': page_size, 'summary': summary, **options}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-path', type=Path, required=True)
    parser.add_argument('--page', type=int, default=1)
    parser.add_argument('--page-size', type=int, default=25)
    parser.add_argument('--search', default='')
    parser.add_argument('--sort-by', choices=('id', 'llm_model', 'llm_judge_model'), default='id')
    parser.add_argument('--order', choices=('asc', 'desc'), default='desc')
    parser.add_argument('--model', default='')
    parser.add_argument('--judge-model', default='')
    parser.add_argument('--manual-grade', choices=('all', 'present', 'missing'), default='all')
    parser.add_argument('--llm-grade', choices=('all', 'present', 'missing'), default='all')
    args = parser.parse_args()
    print(json.dumps(read_answers(args.db_path, args.page, args.page_size, args.search, args.sort_by, args.order, args.model, args.judge_model, args.manual_grade, args.llm_grade), ensure_ascii=False))
