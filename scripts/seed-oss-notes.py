#!/usr/bin/env python3
"""Replace a Stackpad account's notes with the "Open Source Projects" notebook.

Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 scripts/seed-oss-notes.py <email>

- Tombstones every existing note and notebook in the account (deleted = true), so
  signed-in devices remove their local copies on the next sync.
- Also tombstones the built-in sample ids (seed-*) so local-only samples disappear too.
- Adds the "Open Source Projects" notebook with one note per contribution.
The service key is only read from the environment and is never stored.
"""
import html, json, os, sys, time, urllib.request

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_SERVICE_KEY']
EMAIL = sys.argv[1]
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def call(method, path, body=None, prefer=None):
    headers = dict(H)
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(URL + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


users = call('GET', '/auth/v1/admin/users?per_page=1000')['users']
user = next(u for u in users if (u.get('email') or '').lower() == EMAIL.lower())
uid = user['id']
now = int(time.time() * 1000)

# 1) tombstone everything currently in the account
for table in ('notes', 'notebooks'):
    blank = {'deleted': True, 'updated': now}
    if table == 'notes':
        blank.update(title='', content='', text='', tags=[], pinned=False, trashed=None)
    else:
        blank.update(name='')
    call('PATCH', f'/rest/v1/{table}?user_id=eq.{uid}&deleted=eq.false', blank)

# 2) tombstones for the built-in local-only sample ids
seed_rows_nb = [{'user_id': uid, 'id': f'seed-nb-{i}', 'name': '', 'created': now, 'updated': now, 'deleted': True} for i in (1, 2)]
seed_rows_notes = [{'user_id': uid, 'id': f'seed-note-{i}', 'notebook_id': None, 'title': '', 'content': '', 'text': '',
                    'tags': [], 'pinned': False, 'created': now, 'updated': now, 'trashed': None, 'deleted': True} for i in range(1, 8)]
call('POST', '/rest/v1/notebooks?on_conflict=user_id,id', seed_rows_nb, 'resolution=merge-duplicates')
call('POST', '/rest/v1/notes?on_conflict=user_id,id', seed_rows_notes, 'resolution=merge-duplicates')

# 3) the Open Source Projects notebook
NB = 'nb-open-source-projects'
call('POST', '/rest/v1/notebooks?on_conflict=user_id,id',
     [{'user_id': uid, 'id': NB, 'name': 'Open Source Projects', 'created': now, 'updated': now, 'deleted': False}],
     'resolution=merge-duplicates')

C = lambda s: f'<code>{html.escape(s)}</code>'
CONTRIBUTIONS = [
    dict(id='oss-kubecolor-388', title='kubecolor: Colorize kubectl auth commands', tags=['kubecolor', 'kubernetes'],
         repo='kubecolor/kubecolor', pr=388, url='https://github.com/kubecolor/kubecolor/pull/388',
         status='Open', closes='#88',
         problem=f'{C("kubectl auth can-i")}, {C("whoami")} and {C("reconcile")} were not handled by kubecolor’s printer dispatch, so they fell back to flat single-colour output.',
         fix=f'Added a {C("CanIPrinter")} that colours the literal yes/no, routed {C("can-i --list")} and {C("whoami")} through the existing table printer, reused {C("VerbPrinter")} for {C("reconcile")} (verb and dry-run suffix highlighted like apply/create/patch), and added a {C("ThemeAuth")} config section.'),
    dict(id='oss-k9s-4369', title='k9s: Tag Docker release images with version and latest', tags=['k9s', 'docker'],
         repo='derailed/k9s', pr=4369, url='https://github.com/derailed/k9s/pull/4369',
         status='Open', closes='#4120',
         problem=f'Docker images are published by hand with {C("make pushx")}, and the {C("imgx")}/{C("pushx")} targets applied only one {C("-t")} tag, so pushing {C(":latest")} and {C(":vX.Y.Z")} took two runs and the second kept getting forgotten.',
         fix=f'Added an {C("IMAGE_LATEST")} variable and pass both {C("-t")} flags in a single {C("docker buildx build")} call in both targets.'),
    dict(id='oss-thanos-9142', title='thanos: Expose query-frontend over gRPC', tags=['thanos', 'observability'],
         repo='thanos-io/thanos', pr=9142, url='https://github.com/thanos-io/thanos/pull/9142',
         status='Open', closes='#7905',
         problem=f'{C("query-frontend")} only served HTTP, unlike {C("sidecar")}, {C("store")} and {C("receive")}, which expose both HTTP and gRPC. An earlier attempt had gone stale and was closed.',
         fix=f'Added an opt-in gRPC listener that exposes the HTTP API through {C("httpgrpc")}, behind a new {C("--grpc-address")} flag. A clean reimplementation against current main.'),
    dict(id='oss-ubuntu-pro-3638', title='ubuntu-pro-client: Redact log record args', tags=['ubuntu', 'python'],
         repo='canonical/ubuntu-pro-client', pr=3638, url='https://github.com/canonical/ubuntu-pro-client/pull/3638',
         status='Merged 6 Nov 2026', closes=None,
         problem='The log redaction filters did not redact the args of a log record, so sensitive values passed as args could reach the logs.',
         fix='The redaction filters now redact log record args as well.'),
    dict(id='oss-tf-k8s-7', title='terraform-provider-kubernetes: Update storage class allowed_topologies in place', tags=['terraform', 'kubernetes'],
         repo='M-13-M/terraform-provider-kubernetes', pr=7, url='https://github.com/M-13-M/terraform-provider-kubernetes/pull/7',
         status='Merged 3 Nov 2026', closes=None,
         problem=f'Changing {C("allowed_topologies")} on {C("kubernetes_storage_class_v1")} forced the resource to be replaced.',
         fix=f'{C("r/kubernetes_storage_class_v1")} now updates {C("allowed_topologies")} in place.'),
]


def strip(s):
    import re
    return html.unescape(re.sub(r'<[^>]+>', '', s))


rows = []
for i, c in enumerate(CONTRIBUTIONS):
    meta = f'<p><strong>PR:</strong> <a href="{c["url"]}">{c["repo"]}#{c["pr"]}</a> · <strong>Status:</strong> {c["status"]}'
    if c['closes']:
        meta += f' · Closes {c["closes"]}'
    meta += '</p>'
    content = f'{meta}<h2>Problem</h2><p>{c["problem"]}</p><h2>Fix</h2><p>{c["fix"]}</p>'
    text = '\n'.join([f'PR: {c["repo"]}#{c["pr"]} · Status: {c["status"]}' + (f' · Closes {c["closes"]}' if c['closes'] else ''),
                      'Problem', strip(c['problem']), 'Fix', strip(c['fix'])])
    ts = now - i * 60_000  # keep the list in this order (newest first)
    rows.append({'user_id': uid, 'id': c['id'], 'notebook_id': NB, 'title': c['title'], 'content': content, 'text': text,
                 'tags': ['open-source'] + c['tags'], 'pinned': False, 'created': ts, 'updated': ts, 'trashed': None, 'deleted': False})
call('POST', '/rest/v1/notes?on_conflict=user_id,id', rows, 'resolution=merge-duplicates')

live = call('GET', f'/rest/v1/notes?user_id=eq.{uid}&deleted=eq.false&select=title&order=updated.desc')
nbs = call('GET', f'/rest/v1/notebooks?user_id=eq.{uid}&deleted=eq.false&select=name')
print('account:', EMAIL)
print('notebooks:', [n['name'] for n in nbs])
print('notes:', [n['title'] for n in live])
