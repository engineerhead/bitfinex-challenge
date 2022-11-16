Clone the repo. Run

	npm i

Initialzie the grapes
```
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```
Run following to test the OrderBook
```
node Playbook.js
```