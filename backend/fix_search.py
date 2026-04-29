bt = chr(96)
dollar = chr(36)

search_func = (
    "export async function searchUsers(\n"
    "  query: string, token: string, limit = 15\n"
    "): Promise<GraphUser[]> {\n"
    "  const select = 'id,displayName,mail,userPrincipalName,jobTitle,department';\n"
    + f"  const filter = encodeURIComponent(`startsWith(displayName,'{dollar}{{query.replace(/'/g, \\'\\')}}') or startsWith(jobTitle,'{dollar}{{query.replace(/'/g, \\'\\')}}')`);\n"
    + f"  const url = `{dollar}{{GRAPH}}/users?{dollar}select={dollar}{{select}}&{dollar}filter={dollar}{{filter}}&{dollar}top={dollar}{{limit}}`;\n"
    + f"  const res = await fetch(url, {{ headers: {{ Authorization: {bt}Bearer {dollar}{{token}}{bt} }} }});\n"
    + "  if (res.ok) {\n"
    + f"    const data = await res.json() as {{ value: GraphUser[] }};\n"
    + "    if (data.value?.length) return data.value;\n"
    + "  }\n"
    + f"  const searchUrl = `{dollar}{{GRAPH}}/users?{dollar}select={dollar}{{select}}&{dollar}search={dollar}{{encodeURIComponent('displayName:' + query)}}&{dollar}top={dollar}{{limit}}`;\n"
    + f"  const res2 = await fetch(searchUrl, {{ headers: {{ Authorization: {bt}Bearer {dollar}{{token}}{bt}, ConsistencyLevel: 'eventual' }} }});\n"
    + "  if (!res2.ok) return [];\n"
    + f"  const data2 = await res2.json() as {{ value: GraphUser[] }};\n"
    + "  return data2.value ?? [];\n"
    + "}\n"
)

import re
content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()
new_content = re.sub(
    r'export async function searchUsers\(.*?\n\}\n',
    search_func,
    content,
    flags=re.DOTALL
)
open('src/utils/graph.ts', 'w', encoding='utf-8').write(new_content)
print('OK')
print(repr(search_func[:200]))
