import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import logger from '../lib/logger';

export class EventsProducer {
  private kafka: Kafka;

  private producer: Producer;

  constructor() {
    logger.debug('Initializing EventsProducer');
    const KAFKA_BROKERS = process.env.KAFKA ? process.env.KAFKA.split(',') : ['localhost:19092'];
    logger.debug({ KAFKA_BROKERS }, 'Kafka brokers configured');

    this.kafka = new Kafka({
      brokers: KAFKA_BROKERS,
      clientId: 'peerflix-scraper',
    });
    logger.debug('Kafka instance created');

    this.producer = this.kafka.producer();
    logger.debug('Kafka producer created');
  }

  async connect(): Promise<void> {
    logger.debug('Connecting producer');
    await this.producer.connect();
    logger.info('Producer connected');
  }

  async produce(topic: string, message: string, key: string): Promise<void> {
    const record: ProducerRecord = {
      topic,
      messages: [{ value: message, key }],
    };
    logger.debug({ topic, key, message }, 'Producing message');
    await this.producer.send(record);
    logger.debug('Message produced successfully');
  }

  async disconnect(): Promise<void> {
    logger.debug('Disconnecting producer');
    await this.producer.disconnect();
    logger.info('Producer disconnected');
  }
}
