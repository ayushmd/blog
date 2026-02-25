---
title: "Create your own queue"
date: "2025-02-25"
description: "Create your own queue cue"
---

While working on a side project i needed a service which would be trigger and return the event at required timestamp or after specified time(seconds, hours or perhaps days). Well could have got away with something like 

setTimeout(func,1000)

But it would be on RAM and in case of crash there would be not persistence for such events. Also in case of multiple such triggers from different part of codes it would create additional computation and less control over these events. It would be much efficient to create a single component that would manage everything and sit as service something similar to redis or rabbitmq.

Which brought me to thought, There have been many queues which hold data in distributed systems but notification/scheduling system has always been a glue of queue's, database with a timestamp and controllers running in background for notification. So why not create service which does it all.

Initialy started by creating a service which runs on memory with powerful concurrency of Go along with min Heap to do priority scheduling based on ttl. Which had a pretty simple implementation and worked perfectly but it does not guarantee persistence, which is not suitable for something like scheduling a email notification to a user after 2 days. 

```
func (q *TTLQueue) Push(data any, priority int64) {
	// append the element to the store
	el := &element{
		priority: priority,
		data:     data,
		index:    q.store.Len(),
	}
	q.mux.Lock()
	defer q.mux.Unlock()
	heap.Push(&q.store, el)
	// fix the store order
	heap.Fix(&q.store, el.index)
}

func (q *TTLQueue) Pop() any {
	q.mux.Lock()
	defer q.mux.Unlock()
	if q.store.Len() == 0 {
		return nil
	}

	el := heap.Pop(&q.store)
	if el == nil {
		return nil
	}

	return el.(*element).data
}

type TTLItem struct {
	id        int
	createdAt int64
}

func main() {
	ttlq := NewTTLQueue()

	// Background queue listner
	go func() {
		for {
			select {
			case job := <-ttlq.Subscribe():
				jobj := job.(*TTLItem)
				fmt.Printf("Recieved Job %d: Created At: %d Recieved At: %d\n", jobj.id, jobj.createdAt, time.Now().Unix())
			}
		}
	}()

	ttlq.Push(&TTLItem{
		id:        1,
		createdAt: time.Now().Unix(),
	}, time.Now().Add(10*time.Second).Unix())
}
```

## What and why to choose?

### Storage Layer

To provide persistence it would require a database or perhaps a storage engine where the events can be stored and pooled frequently. What better than storage engines like RocksDB or SQLite these are lower levels of storage units which given abstractions over storage. RocksDB(https://rocksdb.org/) is one such embedded db which has been battle tested in MyRocks(MySQL on rocksdb), TikV database which uses it as a lower storage unit, Kafka migrating to rocksdb for storage, Apache Flink in big data processing. 

Such db makes a perfect case for persistence and high availability with little overhead compared to a full blown client-server database. RocksDB is based on LSM Data structure which you can read about more on (link). I chose Go to create this service as it is my goto language and RocksDB is written in C++, though there are direct bindings for C++ functions in Go there are some inconsistensies while using FFI. 

There are many well known KV Stores in native Go Implementation like BadgerDB(used by jaeger), BoltDB/BBolt(used by etcd), etcd, PebbleDB. So after researching for sometime i decided to use PebbledDB which is a RocksDB inspired key-value store written in go. It is open-source and has support for distributed systems used by and built by CockroachDB.  

Here LSM tree KV comes in handy for the current use case because it has levels of storage, Initially it stores the message on RAM(Memtable) and flushes it to disk(SSTables) eventually.

![alt text](/images/create-your-own-queue/LSM_Tree_Writes.png)
*Img 1: LSM Implementation, Source: https://darchuletajr.com/blog/lsm-trees-memtables-sorted-string-tables-introduction*

### Server Layer

To create a cohesive system we would require a server and client with a protocol, and from design perspective will it be a Queue with long running connections or a webhook. I decided to keep it persistent connections with a server protocol as http2 which supports multiplexing and long running connections instead of building one from scratch, During implementation it was apparent there are inconsistent abstractions and standardization between different languages, primarly go and js/ts which was used at the time, So grpc streams proved to be best suited as it is built on http2 and has standardized support across different langugaes.

## Implementation

![alt text](/images/create-your-own-queue/scheduler_diagram.png)
*Img 2: Implementation architecture*

The flow starts by sending a event or a message which consists of QueueName, user data as Message and TTL a timestamp in Milliseconds. As discussed the data is exchanged via GRPC Streams.

As it is in key value store the data is stored in the format of 
```
'category_key:ttl:message_identifier': 'encoded_data'

Key = 'category_key:ttl:message_identifier'
Value = 'encoded_data'
```

The design choice for the key format is as because it makes it faster and efficient for lookups and range scans, how??.LSM stores kv in lexicographically sorted order, so *category_key* is to partition different types of storage units, *ttl* is for prefix matching lookups and a *message_identifier* which is the timestamp in millisecond when the message is recived to avoid collision, message ordering and cleanups.

The message storage units are 'items:', 'zombie:', 'dead:' & 'ack:'. 'items:' is for when the message is recieved initially, 'zombie:' is for when the data is sent to client but not ACK'ed yet for retry mechanism, 'dead:' is for DLQ (dead letter queue) implementation and prone to cleanup after a timeout provided and 'ack:' is intermediate temporary lookup for ack recieved from client.


The value *encoded_data* is stored as encoded binary format. The value includes the data inputs required for application level processing at queue it consists of attibutes given below

```
type Item struct {
	Id        int64  `json:"id"`
	QueueName string `json:"queueName"`
	Data      []byte `json:"data"`
	TTL       int64  `json:"ttl"`
	Retries   uint8  `json:"retries"`
}
```


for example 
```
{
	"queueName": "eventlog",
	"data":"{'msg':'first message but higher ttl'}",
	"ttl" : 1748122974,
}
{
	"queueName": "eventlog",
	"data":"{'msg':'second message but lower ttl'}",
	"ttl" : 1748122874,
}
```
will be stored as in given order,

|Key|Values|
|---|------|
|items:1748122874:1748122474	|encode(1748122474, "eventlog", {'msg':'second message but lower ttl'}, 1748122874, 3)|
|items:1748122974:1748122470	|encode(1748122470, "eventlog", {'msg':'first message but higher ttl'}, 1748122974, 3)|

Other Entries are stored in similar pattern. Also Every step is stored in db to provide persistence.


Items are pooled every 500ms and ttl difference with 9-10s are pushed to priority queue or min-heap which stores it on the ram and also store it with a zombie prefix, zombiefied items are the once which have been sent to client but not acked, it is to provide retry mechanism. if initial item is received with a ttl difference less than 10s it is directly pushed to Priority Queue and zombified which makes it tuned for quick ttl events. Dead items are the once which have been retried and haven't been acked this is for DLQ Implementation, they will be cleaned after a given time provided in config. The Dead letter queue(DLQ) is for when the message is not consumed even after retries or timedout, which can be consumed when client reconnects.

There are multiple Pollers running in the background with intervals as provided either through configs or default requirements. There is backoff to db poller to avoid thrashing.
```
func (m *Scheduler) Poll() {
	go m.poolItems()
	go m.poolZombie()
	go m.poolPriorityQueue()
	go m.poolInstantSender()
	go m.poolJanitor()
}
```

The behaviour can be tweaked by changing the configs from config.yaml
```
# The threshold of ttl when message is loaded on Priority Queue
# Message is loaded on memory (dosent mean it will be gone on switch off)
priority_time: 9000 # in ms (default 9 seconds)

# The number of retries to send to zombified
max_retries: 2

# The time after which the retry is performed (in seconds)
retry_timeout: 10

# Whether to read timed out items after connecting (this will not keep the data after consumption)
consume_expired: true

# Cleanup timeout for items consumed
cleanup_timeout: 86400000 # in ms (default 24 hours)

# Server port
port: 6336
```

When the message is ready to consume after the ttl, router sends the event to client through streams back again.There is also regex wildcard matching to push items to multiple queues at once. Scheduler server provides crud for queues and message/items via grpc. 

Go Cobra is used to provide cli command execution. Also js client sdk and go client sdk is made with grpc.
<reference_links>

Use cases:
1. Notification Service
2. Watchers
3. Simple queueing
4. TTL based solutions


<benchmark>