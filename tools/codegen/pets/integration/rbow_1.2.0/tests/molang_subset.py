"""Small strict evaluator for the numeric Molang expressions exported in 1.1.6.
Tests arithmetic/branching only. NOT Minecraft, an official parser, or renderer.
"""
import math,re
TOKEN=re.compile(r"\s*(?:(\d+(?:\.\d*)?)|([A-Za-z_][\w.]*)|'([^']*)'|(\?\?|&&|\|\||==|!=|<=|>=|[()+\-*/<>,?:!]))")
class Parser:
 def __init__(self,s):
  # Normalize only the two referenced PUBLIC owner variables for numeric tests.
  s=re.sub(r"c\.owning_entity\s*->\s*v\.(attack_time|item_use_normalized)",r"owner.v.\1",s)
  self.tokens=[];pos=0
  while pos<len(s):
   m=TOKEN.match(s,pos)
   if not m:raise ValueError(f'Unsupported token at {s[pos:]}')
   pos=m.end();num,name,string,op=m.groups()
   self.tokens.append(('number',float(num)) if num else ('name',name) if name else ('string',string) if string is not None else (op,op))
  self.i=0
 def take(self,k=None):
  t=self.tokens[self.i] if self.i<len(self.tokens) else ('EOF','EOF')
  if k and t[0]!=k:raise ValueError((k,t))
  self.i+=1;return t
 def peek(self):return self.tokens[self.i][0] if self.i<len(self.tokens) else 'EOF'
 def expr(self,minimum=0):
  op,v=self.take()
  if op in ('number','string'):node=('literal',v)
  elif op=='name':
   if self.peek()=='(':
    self.take('(');args=[]
    if self.peek()!=')':
     args.append(self.expr())
     while self.peek()==',':self.take(',');args.append(self.expr())
    self.take(')');node=('call',v,args)
   else:node=('variable',v)
  elif op=='(':
   node=self.expr();self.take(')')
  elif op in ('-','+','!'):node=('unary',op,self.expr(8))
  else:raise ValueError((op,v))
  prec={'??':2,'||':3,'&&':4,'==':5,'!=':5,'<':5,'>':5,'<=':5,'>=':5,'+':6,'-':6,'*':7,'/':7}
  while True:
   op=self.peek()
   if op=='?' and minimum<=1:
    self.take('?');yes=self.expr();self.take(':');no=self.expr(1);node=('if',node,yes,no);continue
   p=prec.get(op,0)
   if not p or p<minimum:break
   self.take();right=self.expr(p if op=='??' else p+1);node=('binary',op,node,right)
  return node
 def parse(self):
  result=self.expr()
  if self.peek()!='EOF':raise ValueError(('trailing',self.tokens[self.i:]))
  return result

def evaluate(s,env):
 node=Parser(str(s)).parse()
 def run(n):
  kind=n[0]
  if kind=='literal':return n[1]
  if kind=='variable':return env.get(n[1])
  if kind=='if':return run(n[2]) if run(n[1]) else run(n[3])
  if kind=='call':
   args=[run(a) for a in n[2]]
   funcs={'math.sin':lambda a:math.sin(math.radians(a)), 'math.pow':pow,'math.max':max,'math.min':min,'math.clamp':lambda x,a,b:max(a,min(b,x)),
    'q.is_item_name_any':lambda slot,*items:float(env.get(slot) in items),
    'q.is_owner_identifier_any':lambda *items:float(env.get('owner.identifier') in items)}
   if n[1] not in funcs:raise ValueError(('unsupported function',n[1]))
   return funcs[n[1]](*args)
  if kind=='unary':
   value=run(n[2]);return -value if n[1]=='-' else +value if n[1]=='+' else float(not value)
  _,op,left,right=n;a=run(left)
  if op=='??':return run(right) if a is None else a
  if op=='&&':return float(bool(a) and bool(run(right)))
  if op=='||':return float(bool(a) or bool(run(right)))
  b=run(right)
  return {'+':lambda:a+b,'-':lambda:a-b,'*':lambda:a*b,'/':lambda:a/b,'==':lambda:float(a==b),'!=':lambda:float(a!=b),'<':lambda:float(a<b),'>':lambda:float(a>b),'<=':lambda:float(a<=b),'>=':lambda:float(a>=b)}[op]()
 return run(node)
