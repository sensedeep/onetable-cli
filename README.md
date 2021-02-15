# OneTable Migrate CLI
One table to rule them all.

[![npm](https://img.shields.io/npm/v/onetable-cli.svg)](https://www.npmjs.com/package/onetable-cli)
[![npm](https://img.shields.io/npm/l/onetable-cli.svg)](https://www.npmjs.com/package/onetable-cli)

![OneTable](https://www.sensedeep.com/images/ring.png)

Theh DynamoDB OneTable Migration CLI is a command line tool for orchestrating DynamoDB migrations when using [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable) and [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate).

The CLI is ideal for development teams to initialize and reset database contents and for production use to control and sequence step-wise database upgrades.

The OneTable CLI was used in production by the [SenseDeep Serverless Troubleshooter](https://www.sensedeep.com/) for all DynamoDB access for a year before it was published as an NPM module.

## OneTable Migrate CLI Features

* Simple command line utility to control and manage DynamoDB schema and contents.
* Mutate database schema and contents via discrete, reversible migrations.
* Migrate upwards, downwards, to specific versions.
* Automated, ordered sequencing of migrations in both directions.
* Operate on local databases, remote databases via AWS credentials and via Lambda proxy.
* Add and remove seed data in any migration.
* Quick reset of DynamoDB databases for development.
* Show database status and list applied migrations.
* Show outstanding migrations.
* Stored history of migrations.
* No module dependencies other than OneTable.

## Installation

```sh
npm i onetable-cli -g
```

## Getting Started

To get started, create a directory for your migrations in your project.

```sh
mkdir ./migrations
```

Then create a `migrate.json` with your DynamoDB OneTable configuration. We use JSON5 so you can use Javascript object literal syntax.

```javascript
{
    name: 'your-dynamo-table',
    schema: 'schema.js',
}
```

Set the `name` property to the name of your DynamoDB table. Set the `schema` property to point to your OneTable schema.

If you need to have your migrations in a different directory, you can set `onetable.dir` to point to the directory containing the migrations themselves.

Your configuration should match your OneTable configuration with respect to the OneTable `crypto`, `delimiter`, `nulls` and `typeField` settings.

Generate a stub migration

Migrations are Javascript files that export the methods `up` and `down` to apply the migration and a `description` property.

```sh
migrate generate
```

This will create a `0.0.1.js` migration that contains the following. Edit the `up` and `down` methods and description to suit.
The `db` property is the OneTable `Table` instance. This `migrate` property is an instance of the CLI Migrate class.

```javascript
export default {
    description: 'Purpose of this migration',
    async up(db, migrate) {
        // await db.create('Model', {})
    },
    async down(db, migrate) {
        // await db.remove('Model', {})
    }
}
```

### Examples

Apply the next migration

```sh
migrate up
```

Reverse the last migration

```sh
migrate down
```

Migrate to a specific version (up or down)

```sh
migrate 0.1.3
```

Apply all outstanding migrations

```sh
migrate all
```

Show the last applied migration

```sh
migrate status
```

Show applied migrations

```sh
migrate list
```

Show outstanding migrations not yet applied

```sh
migrate outstanding
```

Reset the database to the latest migration. This will erase the database and apply the `latest.js` migration. The purpose of the `latest` migration is to have one migration that can quickly create a new database with the latest schema without having to apply all historical migrations.

```sh
migrate reset
```

Generate a specific version migration

```sh
migrate --bump 2.4.3 generate
```

Do a dry run for a migration and not execute

```sh
migrate --dry up
```

### Command Line Options

```
--aws-access-key                    # AWS access key
--aws-region                        # AWS service region
--aws-secret-key                    # AWS secret key
--bump [major,minor,patch]          # Version digit to bump in generation
--config ./migrate.json             # Migration configuration
--dir directory                     # Change to directory to execute
--dry                               # Dry-run, don't execute
--endpoint http://host:port         # Database endpoint
--force                             # Force action without confirmation
--profile prod|qa|dev|...           # Select configuration profile
--schema ./path/to/schema.js        # Database schema module
--verbose
```


### Accessing AWS

You can configure access to your DynamoDB table in your AWS account several ways:

* via command line options
* via the migrate.json
* via environment variables
* via proxy

Via command line option:

```
migrate --aws-access-key key --aws-secret-key secret --aws-region us-east-1
```

Via migrate.json
```
{
    aws: {
        accessKeyId: 'your-key',
        secretAccessKey: 'your-access',
        region: 'us-east-1'
    }
}
```

Or via environment variables:

```
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

You can also use:
```
export AWS_PROFILE=aws-profile-name
export AWS_REGION=us-east-1
```

To access a local DynamoDB database, set the migrate.json `aws.endpoint` property to point to the listening endpoint.

```
{
    aws: {
        endpoint: 'http://localhost:8000'
    }
}
```

To communicate with a Lambda hosting the [OneTable Migrate Library](), set the `arn` field to the ARN of your Lambda function.
Then define your AWS credentials as described above to grant access for the CLI to your Lambda.

```
{
    arn: 'arn:aws:lambda:us-east-1:123456789012:function:migrate-prod-invoke'
}
```


### Remote Connections

The OneTable CLI uses the [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate) controller library internally to manage migrations. As such, DynamoDB I/O is performed from within the OneTable CLI process. This means I/O travels to and from the system hosting the OneTable CLI process.

While this is fine for development databases and smaller DynamoDB tables, if you have very large database updates, you should run the CLI process from a Lambda in the same AWS region and AZ as your DynamoDB instance. For large databases or complex migrations, this will greatly accelerate your database migrations compared with running the CLI on-prem.

If you have large databases or complex migrations, you should host the [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate) library via AWS Lambda so that it executes in the same AWS region and availablity zone as your DynamoDB instance. This will accelerate migrations by minimizing the I/O transfer time. With this split deployment of CLI and Migration library, higher volume migrations execute more quickly.

To configure remote control of migrations, set the migrate.json `arn` property to the ARN of your migration Lambda that hosts the Migration Library. See [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate) for more details about Lambda hosting of the OneTable Migrate library.

### References

- [OneTable NPM](https://www.npmjs.com/package/dynamodb-onetable)
- [OneTable GitHub](https://github.com/sensedeep/dynamodb-onetable)
- [OneTable Post](https://www.sensedeep.com/blog/posts/2020/dynamodb-onetable.html)
- [OneTable Migrate Library](https://www.npmjs.com/package/onetable-migrate)
- [DocumentClient SDK Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html)

### Participate

All feedback, contributions and bug reports are very welcome.

* [OneTable CLI Issues](https://github.com/sensedeep/onetable-cli/issues)

### Contact

You can contact me (Michael O'Brien) on Twitter at: [@SenseDeepCloud](https://twitter.com/SenseDeepCloud), or [email](mob-pub-18@sensedeep.com) and ready my [Blog](https://www.sensedeep.com/blog).

### SenseDeep

Please try our Serverless trouble shooter [SenseDeep](https://www.sensedeep.com/).
