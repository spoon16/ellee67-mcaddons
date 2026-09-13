"""Pure rest-pose/bone matrix math; no asset files or engine dependency.

Used for exported-geometry calculations and offline validation only.
"""
import numpy as np

def matrix_translation(v):
    m=np.eye(4);m[:3,3]=v;return m

def rotation(v):
    x,y,z=np.radians(v);cx,cy,cz=np.cos([x,y,z]);sx,sy,sz=np.sin([x,y,z])
    return np.array([[cz,-sz,0,0],[sz,cz,0,0],[0,0,1,0],[0,0,0,1]]) @ np.array([[cy,0,sy,0],[0,1,0,0],[-sy,0,cy,0],[0,0,0,1]]) @ np.array([[1,0,0,0],[0,cx,-sx,0],[0,sx,cx,0],[0,0,0,1]])

def matrices(bones,updates=None):
    mats={};by={b['name']:b for b in bones};active=set();updates=updates or {}
    def visit(name):
        if name in mats:return mats[name]
        if name in active:raise ValueError('Bone parent cycle at '+name)
        active.add(name);b=by[name];u=updates.get(name,{})
        r=np.array(b.get('rotation',[0,0,0]),dtype=float)+u.get('rotation',0)
        p=np.array(b['pivot'],dtype=float);pos=u.get('position',[0,0,0]);s=np.array(u.get('scale',[1,1,1]),dtype=float)
        sm=np.eye(4);sm[:3,:3]=np.diag(s)
        parent=visit(b['parent']) if b.get('parent') else np.eye(4)
        m=parent@matrix_translation(pos)@matrix_translation(p)@rotation(r)@sm@matrix_translation(-p)
        mats[name]=m;active.remove(name);return m
    for name in by:visit(name)
    return mats

