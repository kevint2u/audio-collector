def deleteOne(txtfile):
    with open(txtfile, 'r') as fin:
        data = fin.read().splitlines(True)
    with open(txtfile, 'w') as fout:
        fout.writelines(data[1:])

deleteOne('IDtoKeyDict.txt')
