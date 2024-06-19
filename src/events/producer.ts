import { Kafka, Producer, ProducerRecord } from 'kafkajs';

export class EventsProducer {
  private kafka: Kafka;

  private producer: Producer;

  constructor() {
    const KAFKA_BROKERS = process.env.KAFKA ? process.env.KAFKA.split(',') : ['localhost:19092'];
    this.kafka = new Kafka({ 
      brokers: KAFKA_BROKERS,
      clientId: 'peerflix-scraper',
    });
    this.producer = this.kafka.producer();
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async produce(topic: string, message: string, key: string): Promise<void> {
    const record: ProducerRecord = {
      topic,
      messages: [{ value: message, key }],
    };
    await this.producer.send(record);
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}
