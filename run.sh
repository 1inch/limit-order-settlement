#!/bin/bash

rm result
rm result_prev

for i in {1..3}
do
    echo "#$i try"
    [ -f "./result" ] && cp -fr ./result ./result_prev
    yarn deploy matic 2>result
    File=./result
    if grep -q error "$File"; then
        sleep 5
        rm result
    else
        break
    fi
done
