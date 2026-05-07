import ast
import os
import re

admin_file = "backend/app/routes/admin.py"
out_dir = "backend/app/routes/admin"

with open(admin_file, "r", encoding="utf-8") as f:
    source = f.read()

# Try to find all the route functions and where they live
# We'll also just dump the file line-by-line and use AST to figure out the line numbers for functions

tree = ast.parse(source)

functions = []
for node in tree.body:
    if isinstance(node, ast.FunctionDef):
        # check if it's a route
        is_route = False
        for dec in node.decorator_list:
            if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                if dec.func.value.id == 'admin_bp' and dec.func.attr == 'route':
                    is_route = True
                    break
        
        functions.append({
            'name': node.name,
            'is_route': is_route,
            'start': node.lineno,
            'end': node.end_lineno
        })

for f in functions:
    if f['is_route']:
        print(f"{f['name']}: {f['start']}-{f['end']}")
