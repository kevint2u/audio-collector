import math
import random

''' Determine number of IDs to create based on number of captions '''
def findIDs():
    f = open('image_ids.txt','r')
    ids = f.readlines()
    return ids

''' Create list of unique IDs '''
def genKey():
    return ''.join(random.choice('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') for i in range(10))

''' Create text file that combines IDs and Captions '''
def genDict(ids, keys):
    target = open('IDtoKeyDict.txt','w')
    for i in range(len(ids)):
        cur_string = ids[i].rstrip('\n') + " " +  keys[i].rstrip('\n') + "\n"
        target.write(cur_string)

''' Run program '''
ids = findIDs()
ids_len = len(ids)
keys = []
for i in range(ids_len):
    keys_len = len(keys)
    target_len = keys_len + 1
    while keys_len < target_len:
        key = genKey()
        if key not in keys:
            keys.append(key)
        keys_len = len(keys)

genDict(ids, keys)
