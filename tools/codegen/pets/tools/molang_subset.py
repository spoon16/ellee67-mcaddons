"""Small, explicit Molang expression subset for asset tests and offline previews.
Not a Minecraft runtime or official Molang validator. Never evaluates arbitrary Python.
Supported: numeric/string literals, ternary/boolean/arithmetic, supplied variables,
property/item queries, and a whitelisted set of degree-based math functions.
"""
import re, math
TOKEN=re.compile(r"\s*(&&|\|\||==|!=|>=|<=|[!?:(),+*/%<>-]|[A-Za-z_][\w.]*|(?:\d+(?:\.\d*)?|\.\d+)|'[^']*')")
class Expression:
    def __init__(self,text):
        if isinstance(text,(int,float,bool)):self.ast=('literal',text);return
        self.tokens=[];i=0;text=text.strip()
        while i<len(text):
            m=TOKEN.match(text,i)
            if not m:raise ValueError('Unsupported expression syntax: '+text[i:])
            self.tokens.append(m.group(1));i=m.end()
        self.i=0;self.ast=self.parse(0)
        if self.i!=len(self.tokens):raise ValueError('Unconsumed tokens: '+str(self.tokens[self.i:]))
    def peek(self):return self.tokens[self.i] if self.i<len(self.tokens) else None
    def pop(self):
        val=self.peek()
        if val is None:raise ValueError('Unexpected end of expression')
        self.i+=1;return val
    def need(self,val):
        if self.pop()!=val:raise ValueError('Expected '+val)
    def parse(self,minimum):
        token=self.pop()
        if token in ['!','-','+']:left=('unary',token,self.parse(7))
        elif token=='(':left=self.parse(0);self.need(')')
        elif token.startswith("'"):left=('literal',token[1:-1])
        elif token[0].isdigit() or token[0]=='.':left=('literal',float(token))
        else:
            if self.peek()=='(':
                self.pop();args=[]
                if self.peek()!=')':
                    args.append(self.parse(0))
                    while self.peek()==',':self.pop();args.append(self.parse(0))
                self.need(')');left=('call',token.lower(),args)
            else:left=('variable',token.lower())
        prec={'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6}
        while self.peek() in prec and prec[self.peek()]>=minimum:
            op=self.pop();left=(op,left,self.parse(prec[op]+1))
        if minimum==0 and self.peek()=='?':
            self.pop();yes=self.parse(0);self.need(':');left=('if',left,yes,self.parse(0))
        return left
    def __call__(self,env=None,properties=None):
        env=env or {};properties=properties or {}
        def canon(name):
            if name.startswith('q.'):return 'query.'+name[2:]
            if name.startswith('v.'):return 'variable.'+name[2:]
            return name
        def ev(n):
            op=n[0]
            if op=='literal':return n[1]
            if op=='variable':
                name=canon(n[1]);return math.pi if name=='math.pi' else env.get(name,0)
            if op=='unary':
                a=ev(n[2]);return (not a) if n[1]=='!' else (-a if n[1]=='-' else a)
            if op=='if':return ev(n[2]) if ev(n[1]) else ev(n[3])
            if op=='&&':return bool(ev(n[1])) and bool(ev(n[2]))
            if op=='||':return bool(ev(n[1])) or bool(ev(n[2]))
            if op=='call':
                name=canon(n[1]);args=[ev(a) for a in n[2]]
                if name=='query.has_property':return args[0] in properties
                if name=='query.property':return properties[args[0]]
                if name=='query.armor_texture_slot':return env.get('armor_slot_'+str(int(args[0])),0)
                if name=='query.get_equipped_item_name':return env.get('item_offhand' if args and args[0]=='off_hand' else 'item_mainhand','')
                if name in env and callable(env[name]):return env[name](*args)
                funcs={'math.sin':lambda x:math.sin(math.radians(x)), 'math.cos':lambda x:math.cos(math.radians(x)),
                       'math.abs':abs,'math.sqrt':math.sqrt,'math.pow':pow,'math.min':min,'math.max':max,'math.floor':math.floor,
                       'math.clamp':lambda x,a,b:max(a,min(b,x)),'math.mod':lambda a,b:a%b,
                       'math.lerp':lambda a,b,t:a+(b-a)*t}
                if name not in funcs:raise ValueError('Unsupported function '+name)
                return funcs[name](*args)
            a,b=ev(n[1]),ev(n[2])
            if op=='==':return a==b
            if op=='!=':return a!=b
            if op=='<':return a<b
            if op=='>':return a>b
            if op=='<=':return a<=b
            if op=='>=':return a>=b
            if op=='+':return a+b
            if op=='-':return a-b
            if op=='*':return a*b
            if op=='/':return a/b
            if op=='%':return a%b
            raise ValueError('Unsupported AST node '+op)
        return ev(self.ast)

def expression(value):return Expression(value)
